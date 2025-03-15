import { assistantId } from "@/app/assistant-config";
import { openai } from "@/app/openai";

// upload file to assistant's vector store
export async function POST(request: Request) {
  // 1) read FormData
  const formData = await request.formData();
  const fileValue = formData.get("file");

  // 2) ensure we have a valid Blob
  if (!fileValue || typeof fileValue === "string") {
    return new Response("No valid file found in formData.", { status: 400 });
  }

  // fileValue is a Blob (in Next.js 14). We'll wrap it in a File so it satisfies "Uploadable" (FileLike).
  const fileBlob = fileValue as Blob;
  // We'll preserve the type from the Blob if present, and give it a default name:
  const typedFile = new File([fileBlob], "uploaded-file", { type: fileBlob.type });

  // 3) get or create vector store
  const vectorStoreId = await getOrCreateVectorStore();

  // 4) upload using the File
  const openaiFile = await openai.files.create({
    file: typedFile,
    purpose: "assistants",
  });

  // 5) attach the file to vector store
  await openai.beta.vectorStores.files.create(vectorStoreId, {
    file_id: openaiFile.id,
  });

  return new Response();
}

// list files in assistant's vector store
export async function GET() {
  const vectorStoreId = await getOrCreateVectorStore(); // get or create vector store
  const fileList = await openai.beta.vectorStores.files.list(vectorStoreId);

  const filesArray = await Promise.all(
    fileList.data.map(async (file) => {
      const fileDetails = await openai.files.retrieve(file.id);
      const vectorFileDetails = await openai.beta.vectorStores.files.retrieve(
        vectorStoreId,
        file.id
      );
      return {
        file_id: file.id,
        filename: fileDetails.filename,
        status: vectorFileDetails.status,
      };
    })
  );
  return Response.json(filesArray);
}

// delete file from assistant's vector store
export async function DELETE(request: Request) {
  const body = await request.json();
  const fileId = body.fileId;

  const vectorStoreId = await getOrCreateVectorStore(); // get or create vector store
  await openai.beta.vectorStores.files.del(vectorStoreId, fileId); // delete file from vector store

  return new Response();
}

/* Helper functions */

const getOrCreateVectorStore = async () => {
  const assistant = await openai.beta.assistants.retrieve(assistantId);

  // if the assistant already has a vector store, return it
  if ((assistant.tool_resources?.file_search?.vector_store_ids ?? []).length > 0) {
    return assistant.tool_resources.file_search.vector_store_ids[0];
  }

  // otherwise, create a new vector store and attach it to the assistant
  const vectorStore = await openai.beta.vectorStores.create({
    name: "sample-assistant-vector-store",
  });
  await openai.beta.assistants.update(assistantId, {
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStore.id],
      },
    },
  });
  return vectorStore.id;
};