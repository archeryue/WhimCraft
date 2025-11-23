import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

// GET - Get conversation with messages
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const conversationRef = db.collection(COLLECTIONS.CONVERSATIONS).doc(params.id);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return new Response("Conversation not found", { status: 404 });
    }

    const conversationData = conversationDoc.data();

    if (conversationData?.user_id !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // Get messages
    const messagesSnapshot = await conversationRef
      .collection(COLLECTIONS.MESSAGES)
      .orderBy("created_at", "asc")
      .get();

    const messages = messagesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        role: data.role,
        content: data.content,
        created_at: data.created_at.toDate().toISOString(),
      };
    });

    return Response.json({
      id: conversationDoc.id,
      user_id: conversationData.user_id,
      title: conversationData.title,
      model: conversationData.model,
      model_tier: conversationData.model_tier || 'main',
      created_at: conversationData.created_at.toDate().toISOString(),
      updated_at: conversationData.updated_at.toDate().toISOString(),
      messages,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// DELETE - Delete conversation
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const conversationRef = db.collection(COLLECTIONS.CONVERSATIONS).doc(params.id);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return new Response("Conversation not found", { status: 404 });
    }

    const conversationData = conversationDoc.data();

    if (conversationData?.user_id !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // Delete all messages in the conversation
    const messagesSnapshot = await conversationRef
      .collection(COLLECTIONS.MESSAGES)
      .get();

    const batch = db.batch();
    messagesSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Delete the conversation
    await conversationRef.delete();

    return Response.json({ message: "Conversation deleted successfully" });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// PATCH - Update conversation (e.g., model_tier)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { model_tier } = await req.json();

    if (!model_tier || (model_tier !== 'main' && model_tier !== 'pro')) {
      return new Response("Invalid model_tier value", { status: 400 });
    }

    const conversationRef = db.collection(COLLECTIONS.CONVERSATIONS).doc(params.id);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return new Response("Conversation not found", { status: 404 });
    }

    const conversationData = conversationDoc.data();

    if (conversationData?.user_id !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // Update the conversation
    await conversationRef.update({
      model_tier,
      updated_at: new Date(),
    });

    return Response.json({
      message: "Conversation updated successfully",
      model_tier
    });
  } catch (error) {
    console.error("Error updating conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
