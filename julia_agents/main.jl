# --- Import Dependencies ---
using HTTP
using JSON
using DotEnv

# --- Load Environment Variables ---
DotEnv.config()

# --- Include Agent Logic ---
include("code_guardian.jl")
include("onchain_scribe.jl")
include("task_master.jl") 

# --- Define the Router ---
const ROUTER = HTTP.Router()

"""
Handles all incoming agent invocation requests.
"""
function handle_agent_invoke(req::HTTP.Request)
    try
        body = JSON.parse(String(req.body))
        agent_name = body["agent"]
        payload = body["payload"]

        println("Received request to invoke agent: ", agent_name)

        # Route to the correct agent function based on the 'agent' field.
        response_data = if agent_name == "code_guardian"
            CodeGuardian.analyze(payload)
        elseif agent_name == "onchain_scribe"
            OnChainScribe.commit(payload)
        elseif agent_name == "task_master" # <-- The new routing logic is added here.
            TaskMaster.answer(payload)
        else
            Dict("error" => "Agent not found: " * agent_name)
        end

        # Return the result as a JSON response.
        return HTTP.Response(200, ["Content-Type" => "application/json"], JSON.json(response_data))

    catch e
        println("Error processing request: ", e)
        error_response = Dict("error" => "Invalid request format or server error.")
        return HTTP.Response(400, ["Content-Type" => "application/json"], JSON.json(error_response))
    end
end

# --- Register the Route ---
HTTP.register!(ROUTER, "POST", "/api/v1/invoke", handle_agent_invoke)

# --- Start the Server ---
println("Julia Agent Server starting on http://0.0.0.0:8081...")
HTTP.serve(ROUTER, "0.0.0.0", 8081)

