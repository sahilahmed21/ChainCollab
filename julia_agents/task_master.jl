# --- Import Dependencies ---
using HTTP
using JSON

# --- Define the Module ---
module TaskMaster

    export answer

    const CONTEXT_FILE_PATH = "TODO.md" # The file this agent will read for context.
    const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent"

    """
    Answers a user's question based on the context from a local file (e.g., TODO.md).
    """
    function answer(payload::Dict)
        # --- Get API Key ---
        api_key = get(ENV, "LLM_API_KEY", "")
        if isempty(api_key)
            return Dict("error" => "LLM_API_KEY not found.")
        end

        # --- Read Context File ---
        context = ""
        try
            context = read(CONTEXT_FILE_PATH, String)
        catch e
            println("Warning: Could not read context file at ", CONTEXT_FILE_PATH)
            context = "No context file found."
        end

        # --- Get User Question ---
        question = get(payload, "question", "")
        if isempty(question)
            return Dict("error" => "No question was provided in the payload.")
        end

        # --- Construct Prompt for Gemini ---
        prompt = """
        You are a project management assistant. Based on the following project context, answer the user's question.

        --- PROJECT CONTEXT ---
        $(context)
        --- END CONTEXT ---

        User's Question: "$(question)"
        """

        full_url = GEMINI_API_BASE_URL * "?key=" * api_key
        headers = ["Content-Type" => "application/json"]
        body = Dict("contents" => [Dict("parts" => [Dict("text" => prompt)])])

        println("Asking TaskMaster agent a question...")

        # --- Call Gemini API ---
        try
            response = HTTP.post(full_url, headers, JSON.json(body))
            response_body = JSON.parse(String(response.body))
            llm_answer = response_body["candidates"][1]["content"]["parts"][1]["text"]
            return Dict("answer" => llm_answer)
        catch e
            println("Error calling Gemini API for TaskMaster: ", e)
            return Dict("error" => "Failed to get an answer from the LLM.")
        end
    end

end # module TaskMaster
