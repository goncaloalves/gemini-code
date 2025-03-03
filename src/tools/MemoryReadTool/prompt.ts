export const DESCRIPTION = `Read contents from the memory directory. This tool allows you to:
1. List all memory files
2. Read specific memory files
3. Access the memory index`

export const PROMPT = `Use this tool to:
- Read the contents of a specific memory file by providing its path
- List all available memory files and view the memory index by not providing a path
- Get information about previous conversations or stored knowledge

Input format:
{
  "file_path": "optional/path/to/memory/file.txt"
}

The tool will return:
- If file_path is provided: The contents of that specific memory file
- If no file_path: The memory index and list of all available memory files`