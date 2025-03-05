export let assistantId = "asst_wjwKH4eZEiniEflJx7B3xF0u"; // set your assistant ID here

if (assistantId === "") {
  assistantId = process.env.OPENAI_ASSISTANT_ID;
}
