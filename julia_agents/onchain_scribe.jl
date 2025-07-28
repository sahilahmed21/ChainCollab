# --- Import Dependencies ---
using JSON

# --- Define the Module ---
module OnChainScribe

    # Export the main function so it can be called from main.jl
    export commit

    """
    Executes a command-line script to call the 'log_contribution' instruction
    on the deployed Solana smart contract.
    """
    function commit(payload::Dict)
        println("OnChainScribe agent invoked.")

        # --- Retrieve Configuration from Environment ---
        # These should be set in your .env file or system environment.
        contract_id = get(ENV, "CONTRACT_ID", "")
        wallet_path = get(ENV, "SOLANA_WALLET_PATH", "")
        rpc_url = get(ENV, "SOLANA_RPC_URL", "http://127.0.0.1:8899") # Default to local

        if isempty(contract_id) || isempty(wallet_path)
            return Dict("error" => "CONTRACT_ID or SOLANA_WALLET_PATH not found in environment.")
        end

        # --- Extract Data from Payload ---
        code_hash = get(payload, "codeHash", "")
        if isempty(code_hash)
            return Dict("error" => "codeHash not provided in payload.")
        end

        # --- Construct and Execute the Shell Command ---
        # This agent assumes you have a helper script (e.g., in TypeScript/Node.js)
        # that takes these arguments and handles the Anchor transaction logic.
        # We are using `node` to run a hypothetical JavaScript helper.
        # The path to the script is relative to where this Julia server is run.
        # For example: `../backend/scripts/call_contract.js`
        
        # IMPORTANT: You will need to create this helper script.
        helper_script_path = "../backend/call_contract.js" # Example path

        cmd = `node $helper_script_path --contract $contract_id --wallet $wallet_path --url $rpc_url --hash $code_hash`

        println("Executing command: ", cmd)

        try
            # Execute the command and capture its output
            process = pipeline(cmd, stdout=IOBuffer(), stderr=IOBuffer())
            wait(process)
            
            output = String(take!(process.stdout))
            errors = String(take!(process.stderr))

            if process.exitcode != 0
                println("Error executing on-chain script: ", errors)
                return Dict("error" => "Failed to execute transaction.", "details" => errors)
            end

            # Assuming the helper script prints the transaction ID on success
            println("Transaction successful. Signature: ", output)
            return Dict("transactionId" => chomp(output)) # chomp removes trailing newline

        catch e
            println("Error running command: ", e)
            return Dict("error" => "An unexpected error occurred while running the scribe command.")
        end
    end

end # module OnChainScribe
