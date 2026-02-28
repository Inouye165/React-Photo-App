# Pipeline Graphs & Visualization

This directory contains visualization resources for the LangGraph AI pipeline used in Lumina.

## Purpose
To visualize the complex execution flows of the LangGraph orchestration, including node transitions, AI model decisions, and data transformations.

## How to Generate Execution Logs
1. Run the worker and trigger an AI run for a photo.
2. The LangGraph audit logger (`server/ai/langgraph/audit_logger.js`) writes `langgraph_execution.md` at the repo root.
3. Note: each new run clears and rewrites the file (see `logGraphStart`).
4. This file captures:
   - Node execution start/finish
   - LLM calls (prompts & responses)
   - Timestamps
   - State transitions
   - Tool usage (e.g., web search, Places API)

## Naming Convention
- **Raw Logs**: `{category}-execution-log.md` (e.g., `collectibles-execution-log.md`)
- **Visualizations**: `{category}-flowchart.md` (e.g., `collectibles-flowchart.md`)

## How to Create Flowcharts
1. Take an execution log file (e.g., `collectibles-execution-log.md`).
2. Identify all nodes, their inputs/outputs, and transitions.
3. Use an LLM (like Claude or GPT-4) with the following prompt:
   > "Create a comprehensive Mermaid flowchart from this LangGraph execution log. Make it top-to-bottom layout, use high-contrast colors for readability, include all node details, timestamps, model names, and data flow. Format as graph TD with detailed labels."
4. Save the output to a new markdown file using the naming convention above.

## Embedding in GitHub
Use standard Mermaid code blocks in your markdown files:

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`

GitHub will automatically render these as interactive diagrams.

## File Structure
- `collectibles-execution-log.md`: Raw execution log for a collectibles analysis run.
- `collectibles-flowchart.md`: Rendered Mermaid diagram visualizing the collectibles workflow.

> **Note**: The flowchart files contain rendered Mermaid diagrams that provide a high-level view of the process. Refer to the execution logs for exact data payloads and timestamps.
