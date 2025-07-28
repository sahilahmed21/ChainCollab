#!/bin/bash

echo "Starting Julia Agent Server..."

# This command does two things:
# 1. --project=. : Tells Julia to use the Project.toml in the current directory.
# 2. -e '...' : Executes a Julia command.
#    - using Pkg; Pkg.instantiate() : Installs all dependencies from Project.toml.
#    - include("main.jl") : Starts the web server after dependencies are installed.

julia --project=. -e 'using Pkg; Pkg.instantiate(); include("main.jl")'

echo "Julia Agent Server started successfully."