import json
import os
import re

# Absolute paths
TRANSCRIPT_PATH = r"C:\Users\Michael\.gemini\antigravity\brain\ecb8f652-2063-437f-9748-8b3bc317362a\.system_generated\logs\transcript.jsonl"
OUTPUT_DIR = r"C:\Users\Michael\.gemini\antigravity\scratch\gto-poker-academy"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "chat_history.md")

def clean_content(content):
    if not content:
        return ""
    # Strip <USER_REQUEST> tags if present
    content = re.sub(r'</?USER_REQUEST>', '', content)
    # Strip <ADDITIONAL_METADATA> blocks
    content = re.sub(r'<ADDITIONAL_METADATA>[\s\S]*?</ADDITIONAL_METADATA>', '', content)
    # Strip <USER_SETTINGS_CHANGE> blocks
    content = re.sub(r'<USER_SETTINGS_CHANGE>[\s\S]*?</USER_SETTINGS_CHANGE>', '', content)
    return content.strip()

def main():
    if not os.path.exists(TRANSCRIPT_PATH):
        print(f"Error: Transcript file not found at {TRANSCRIPT_PATH}")
        return

    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    markdown_lines = [
        "# 🤖 GTO Poker Academy - Development Conversation Log",
        "",
        "This file records the entire engineering conversation and planning history between the **User** and **Antigravity (AI)**. It is automatically generated and updated.",
        "",
        "---",
        ""
    ]

    step_num = 1
    with open(TRANSCRIPT_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except Exception as e:
                print(f"Warning: Failed to parse line: {e}")
                continue

            source = data.get("source")
            msg_type = data.get("type")
            content = data.get("content", "")
            thinking = data.get("thinking", "")
            created_at = data.get("created_at", "")

            # We care about User Inputs and Model Responses
            if source == "USER_EXPLICIT" and msg_type == "USER_INPUT":
                cleaned = clean_content(content)
                if cleaned:
                    markdown_lines.append(f"## 👤 User (Step {step_num})")
                    markdown_lines.append(f"*{created_at}*")
                    markdown_lines.append("")
                    markdown_lines.append(cleaned)
                    markdown_lines.append("")
                    markdown_lines.append("---")
                    markdown_lines.append("")
                    step_num += 1

            elif source == "MODEL" and msg_type == "PLANNER_RESPONSE":
                cleaned = clean_content(content)
                if cleaned or thinking:
                    markdown_lines.append(f"## 🤖 Antigravity (Step {step_num})")
                    markdown_lines.append(f"*{created_at}*")
                    markdown_lines.append("")
                    
                    if thinking:
                        # Format thoughts in a nice collapsible details element
                        markdown_lines.append("<details>")
                        markdown_lines.append("<summary>💡 View AI Thought Process & Planning Details</summary>")
                        markdown_lines.append("")
                        # Indent thinking or put in blockquote
                        thinking_lines = thinking.strip().split('\n')
                        for t_line in thinking_lines:
                            markdown_lines.append(f"> {t_line}")
                        markdown_lines.append("")
                        markdown_lines.append("</details>")
                        markdown_lines.append("")

                    if cleaned:
                        markdown_lines.append(cleaned)
                    
                    markdown_lines.append("")
                    markdown_lines.append("---")
                    markdown_lines.append("")
                    step_num += 1

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(markdown_lines))

    print(f"Success: Exported conversation log to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
