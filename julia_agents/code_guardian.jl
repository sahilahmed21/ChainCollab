# --- Import Dependencies ---
using HTTP
using JSON

# --- Define the Module ---
# Encapsulating the agent's logic in a module is good practice.
module CodeGuardian

    # Export the main function so it can be called from main.jl
    export analyze

    # Note: Using Gemini Pro model
    const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent"

    """
    Analyzes a given code snippet using the Google Gemini API.
    """
    function analyze(payload::Dict)
        # Retrieve the API key from environment variables
        api_key = get(ENV, "LLM_API_KEY", "")
        if isempty(api_key)
            return Dict("error" => "LLM_API_KEY (Gemini API Key) not found in environment variables.")
        end

        # Extract the code from the payload sent by the Node.js server
        code_to_analyze = get(payload, "code", "")
        if isempty(code_to_analyze)
            return Dict("feedback" => "No code to analyze.")
        end

        # --- Construct the Request for the Gemini API ---
        # The API key is passed as a query parameter in the URL for Gemini
        full_url = GEMINI_API_BASE_URL * "?key=" * api_key

        headers = [
            "Content-Type" => "application/json"
        ]

        # Define the prompt and structure for the Gemini API call
        prompt = "You are a helpful code analysis assistant. Analyze the following code snippet for potential bugs, style issues, or improvements. Provide concise feedback.\n\nCode:\n" * code_to_analyze
        
        body = Dict(
            "contents" => [
                Dict("parts" => [
                    Dict("text" => prompt)
                ])
            ]
        )

        println("Sending code to Gemini for analysis...")

        # --- Make the API Call ---
        try
            response = HTTP.post(full_url, headers, JSON.json(body))
            response_body = JSON.parse(String(response.body))
            
            # Extract the feedback from the Gemini's response structure
            # Note: Julia uses 1-based indexing
            feedback = response_body["candidates"][1]["content"]["parts"][1]["text"]
            
            # Return the feedback in a structured format
            return Dict("feedback" => feedback)

        catch e
            println("Error calling Gemini API: ", e)
            # Provide a more specific error if the response format is unexpected
            if haskey(response_body, "error")
                println("API Error Details: ", response_body["error"]["message"])
                return Dict("error" => "Gemini API Error: " * response_body["error"]["message"])
            end
            return Dict("error" => "Failed to get analysis from Gemini.")
        end
    end

end # module CodeGuardian
