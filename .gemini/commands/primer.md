# Prime Context for Claude Code

## Step 1: Understand Project Structure

Use the `find` command to get an understanding of the current root project folder structure (since `tree` may not be available in WSL):
```bash
find . -maxdepth 3 -type d -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/.git/*" | head -50
```

Start with reading the `GEMINI.md` file if it exists to get an understanding of the project.

Read the current root project folder README.md file to get an understanding of the project.

Read key files in root project directory (package.json, tsconfig.json, next.config.ts, etc.).

## Step 2: Setup Serena MCP Server in WSL

**IMPORTANT: This project runs in WSL (Windows Subsystem for Linux). Follow these steps to start Serena MCP server:**

### 2.1 Install uv/uvx (if not already installed)

First, check if uvx is available:
```bash
uvx --version
```

If not found, install uv package manager:
```bash
# Install uv (which includes uvx)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Add to PATH for current session
source $HOME/.local/bin/env

# Verify installation
uvx --version
```

### 2.2 Start Serena MCP Server in Background

Run this command to start the Serena MCP server in background:
```bash
export PATH="$HOME/.local/bin:$PATH" && uvx --from git+https://github.com/oraios/serena serena start-mcp-server --transport sse --enable-web-dashboard true --context ide-assistant
```

**Key Parameters:**
- `--transport sse` - Use Server-Sent Events for communication
- `--enable-web-dashboard true` - Enable web dashboard at http://127.0.0.1:24282/dashboard/index.html
- `--context ide-assistant` - Optimize for IDE operations (excludes some file operations handled by Claude Code)

**Note:** Run this command with `run_in_background: true` flag in Bash tool to keep server running while continuing other tasks.

### 2.3 Verify Serena Server Status

Wait 15-20 seconds for server initialization, then check status:
```bash
# Check if server is running (look for process ID and "Application startup complete")
```

Expected output should show:
- "Serena web dashboard started at http://127.0.0.1:24282/dashboard/index.html"
- "Starting MCP server ..."
- "Uvicorn running on http://0.0.0.0:8000"
- List of 20 active tools

### 2.4 Serena Available Tools (20 tools in ide-assistant context)

Once connected, you'll have access to:
- **Symbol Operations:** `find_symbol`, `get_symbols_overview`, `find_referencing_symbols`, `replace_symbol_body`
- **Code Navigation:** `search_for_pattern`, `find_file`, `list_dir`
- **Symbol Editing:** `insert_after_symbol`, `insert_before_symbol`
- **Memory Management:** `read_memory`, `write_memory`, `list_memories`, `delete_memory`
- **Project Management:** `activate_project`, `onboarding`
- **Analysis:** `think_about_collected_information`, `think_about_task_adherence`, `think_about_whether_you_are_done`
- **Configuration:** `get_current_config`, `check_onboarding_performed`

**IMPORTANT: When the Serena MCP server is connected, use Serena tools to search through the current root project codebase for intelligent, token-efficient code exploration. If you get any errors using Serena, retry with different Serena tools or approaches.**

## Step 3: Analyze and Report

Use Glob and Read tools to explore the codebase structure:
```bash
# Find all TypeScript source files
Glob(pattern="**/*.ts", path="src")
Glob(pattern="**/*.tsx", path="src")
```

Explain back to me (Based on current root project folder):
- Project structure (directories, key modules)
- Project purpose and goals
- Key files and their purposes
- Important dependencies (from package.json)
- Important configuration files (tsconfig.json, next.config.ts, etc.)
- Test coverage and quality metrics
- AI integration details (GenKit flows, Perplexity client)

## Troubleshooting

**If uvx command not found:**
- Install uv using curl: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Add to PATH: `export PATH="$HOME/.local/bin:$PATH"`
- Source environment: `source $HOME/.local/bin/env`

**If Serena server fails to start:**
- Check if port 8000 or 24282 is already in use
- Review error logs in stderr output
- Ensure git is accessible for cloning the repository

**If tree command not available:**
- Use `find` command as alternative
- Or install tree: `sudo apt-get install tree` (may require sudo permissions)