export const DESCRIPTION = `Write content to memory files in the designated memory directory. This tool allows you to:
1. Create new memory files
2. Update existing memory files
3. Store persistent information across conversations`

export const PROMPT = `Use this tool to write or update memory files. Memory files are used to store persistent information that can be accessed across different conversations.

Input format:
{
  "file_path": "path/to/memory/file.txt",
  "content": "Content to write to the file"
}

Notes:
- File paths must be relative to the memory directory
- Directory structure will be created automatically if it doesn't exist
- Content will overwrite any existing file content
- All files are stored as UTF-8 text`