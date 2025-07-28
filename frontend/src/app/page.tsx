// @ts-nocheck
'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Connection, PublicKey } from '@solana/web3.js';
import Editor from '@monaco-editor/react';
import io from 'socket.io-client';
import { sha256 } from 'js-sha256';
import { Code, Bot, GitCommit, Send } from 'lucide-react';
import * as borsh from '@coral-xyz/borsh';

// Required styles for the wallet adapter
require('@solana/wallet-adapter-react-ui/styles.css');

// --- Configuration ---
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://127.0.0.1:8899';
const ROOM_ID = 'main-collaboration-room'; // Static room for this example

// --- Borsh Schema for Deserializing On-Chain Data ---
const contributionSchema = borsh.struct([
  borsh.publicKey('contributor'),
  borsh.i64('timestamp'),
  borsh.str('code_hash'),
]);

const logStateSchema = borsh.struct([
  borsh.publicKey('authority'),
  borsh.vec(contributionSchema, 'contributions'),
]);

// --- Main Application Component ---
const HomePage = () => {
  const [socket, setSocket] = useState(null);
  const [code, setCode] = useState('// Welcome to JuliaCode Collab!\n');
  const [agentFeedback, setAgentFeedback] = useState('...');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [contributions, setContributions] = useState([]);
  const [notification, setNotification] = useState('');
  const { publicKey, connected } = useWallet();

  // --- Fetch On-Chain Data ---
  const fetchContributions = async () => {
    try {
      const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
      if (!contractId) {
        console.error("NEXT_PUBLIC_CONTRACT_ID is not set in .env.local");
        return;
      }
      const connection = new Connection(RPC_URL, 'confirmed');
      const programId = new PublicKey(contractId);

      const [logStatePDA] = await PublicKey.findProgramAddress(
        [Buffer.from("log_state")],
        programId
      );

      const accountInfo = await connection.getAccountInfo(logStatePDA);
      if (accountInfo) {
        const decodedState = logStateSchema.decode(accountInfo.data);
        setContributions(decodedState.contributions.reverse());
      }
    } catch (error) {
      console.error("Failed to fetch contributions:", error);
    }
  };

  // --- Socket.io Connection and Event Handling ---
  useEffect(() => {
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to backend server!');
      newSocket.emit('join-room', ROOM_ID);
    });

    newSocket.on('code-update', (newCode) => setCode(newCode));
    newSocket.on('agent-feedback', (data) => setAgentFeedback(data.feedback || data.error || 'No feedback received.'));
    newSocket.on('task-master-response', (data) => setChatMessages(prev => [...prev, { sender: 'bot', text: data.answer }]));
    newSocket.on('milestone-committed', () => {
      console.log('Milestone committed! Refreshing contributions...');
      fetchContributions();
    });

    fetchContributions();

    return () => newSocket.disconnect();
  }, []);

  // --- Event Handlers ---
  const handleEditorChange = (value) => {
    setCode(value);
    if (socket) {
      socket.emit('code-change', { room: ROOM_ID, code: value });
    }
  };

  const handleCommit = () => {
    if (!connected || !publicKey) {
      setNotification('Please connect your wallet to commit.');
      setTimeout(() => setNotification(''), 3000);
      return;
    }
    if (socket) {
      const codeHash = sha256(code);
      socket.emit('commit-milestone', {
        room: ROOM_ID,
        walletAddress: publicKey.toBase58(),
        codeHash: codeHash,
      });
    }
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (chatInput.trim() && socket) {
      setChatMessages(prev => [...prev, { sender: 'user', text: chatInput }]);
      socket.emit('invoke-task-master', { question: chatInput });
      setChatInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
      <header className="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Code className="text-purple-400" size={28} />
          <h1 className="text-xl font-bold">JuliaCode Collab</h1>
        </div>
        <WalletMultiButton />
      </header>

      <main className="flex-grow grid md:grid-cols-2 gap-4 p-4 overflow-hidden">
        <div className="flex flex-col h-full">
          <div className="flex-grow border border-gray-700 rounded-lg overflow-hidden">
            <Editor
              height="100%"
              theme="vs-dark"
              defaultLanguage="javascript"
              value={code}
              onChange={handleEditorChange}
            />
          </div>
          <button
            onClick={handleCommit}
            disabled={!connected}
            className="mt-4 flex items-center justify-center gap-2 w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            <GitCommit size={20} />
            Commit Milestone to Solana
          </button>
        </div>

        <div className="flex flex-col gap-4 h-full overflow-y-auto">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-2"><Bot size={20} /> Code Guardian Feedback</h2>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{agentFeedback}</p>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex-shrink-0">
            <h2 className="text-lg font-semibold mb-3">On-Chain Contribution Log</h2>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {contributions.length > 0 ? contributions.map((log, i) => (
                <div key={i} className="text-xs bg-gray-700 p-2 rounded">
                  <p><b>Contributor:</b> {log.contributor.toBase58().substring(0, 8)}...</p>
                  <p><b>Timestamp:</b> {new Date(log.timestamp.toNumber() * 1000).toLocaleString()}</p>
                  <p><b>Code Hash:</b> {log.code_hash.substring(0, 16)}...</p>
                </div>
              )) : <p className="text-sm text-gray-400">No contributions found.</p>}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 flex flex-col flex-grow">
            <h2 className="p-4 text-lg font-semibold border-b border-gray-700">Chat with Task Master</h2>
            <div className="flex-grow p-4 space-y-4 overflow-y-auto">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <p className={`max-w-xs p-3 rounded-lg ${msg.sender === 'user' ? 'bg-purple-600' : 'bg-gray-600'}`}>{msg.text}</p>
                </div>
              ))}
            </div>
            <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-700 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about project tasks..."
                className="w-full bg-gray-700 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button type="submit" aria-label="Send message" className="bg-purple-600 p-2 rounded-lg hover:bg-purple-700"><Send size={20} /></button>
            </form>
          </div>
        </div>
      </main>

      {notification && (
        <div className="absolute bottom-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg animate-pulse">
          {notification}
        </div>
      )}
    </div>
  );
};

// --- Wallet Provider Wrapper ---
const App = () => {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <HomePage />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default App;
