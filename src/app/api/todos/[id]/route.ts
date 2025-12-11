import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

// PATCH - Update todo (toggle completed, update content)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const updates = await req.json();

    // Verify ownership
    const todoRef = db.collection(COLLECTIONS.TODOS).doc(id);
    const todoDoc = await todoRef.get();

    if (!todoDoc.exists) {
      return new Response("Todo not found", { status: 404 });
    }

    if (todoDoc.data()?.user_id !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof updates.completed === "boolean") {
      updateData.completed = updates.completed;
    }

    if (typeof updates.content === "string" && updates.content.trim().length > 0) {
      updateData.content = updates.content.trim();
    }

    await todoRef.update(updateData);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating todo:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// DELETE - Delete todo
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const todoRef = db.collection(COLLECTIONS.TODOS).doc(id);
    const todoDoc = await todoRef.get();

    if (!todoDoc.exists) {
      return new Response("Todo not found", { status: 404 });
    }

    if (todoDoc.data()?.user_id !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    await todoRef.delete();

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting todo:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
