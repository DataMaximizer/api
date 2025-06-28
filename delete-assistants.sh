#!/bin/bash

# This script deletes all OpenAI assistants associated with an API key.
#
# Usage:
# chmod +x delete-assistants.sh
# ./delete-assistants.sh your_api_key_here
#
# Requires `jq` to be installed for JSON parsing.

API_KEY="$1"

# Check if API_KEY is provided
if [ -z "$API_KEY" ]; then
  echo "Error: The API key is not provided as an argument."
  echo "Please run the script with your API key:"
  echo "./delete-assistants.sh your_api_key_here"
  exit 1
fi

echo "Fetching all assistants..."

# Fetch the list of assistants and extract their IDs using jq
# The `assistants=v2` header is required for file search features.
ASSISTANT_IDS=$(curl -s "https://api.openai.com/v1/assistants" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "OpenAI-Beta: assistants=v2" | jq -r '.data[].id')

# Check if any assistants were found
if [ -z "$ASSISTANT_IDS" ]; then
  echo "No assistants found to delete."
  exit 0
fi

echo "Found assistants to delete. Starting deletion process..."

# Loop through each assistant ID and delete it
for ID in $ASSISTANT_IDS; do
  echo "Deleting assistant: $ID"
  response=$(curl -s -w "%{http_code}" -X DELETE "https://api.openai.com/v1/assistants/$ID" \
    -H "Authorization: Bearer $API_KEY" \
    -H "OpenAI-Beta: assistants=v2")
  
  http_code=${response: -3}
  body=${response:0:${#response}-3}

  if [ "$http_code" -eq 200 ]; then
    echo "Successfully deleted assistant $ID."
  else
    echo "Failed to delete assistant $ID. Status code: $http_code"
    echo "Response: $body"
  fi
done

echo "All assistants have been processed."