import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

// Helper to get today's date in YYYY-MM-DD format for a given timezone
function getTodayDate(timezone?: string): string {
  const now = new Date();
  if (timezone) {
    try {
      // Format date in the user's timezone
      return now.toLocaleDateString("en-CA", { timeZone: timezone }); // en-CA gives YYYY-MM-DD format
    } catch {
      // Invalid timezone, fall back to UTC
    }
  }
  return now.toISOString().split("T")[0];
}

// GET - List user's todos for today (with carryover from previous days)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get timezone from query param (sent by client)
    const timezone = req.nextUrl.searchParams.get("tz") || undefined;
    const today = getTodayDate(timezone);
    const userId = session.user.id;

    // First, try to get today's todos
    const todaySnapshot = await db
      .collection(COLLECTIONS.TODOS)
      .where("user_id", "==", userId)
      .where("date", "==", today)
      .orderBy("created_at", "desc")
      .get();

    // If we have todos for today, return them
    if (!todaySnapshot.empty) {
      const todos = todaySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          content: data.content,
          completed: data.completed,
          date: data.date,
          created_at: data.created_at.toDate().toISOString(),
          updated_at: data.updated_at.toDate().toISOString(),
        };
      });
      return Response.json({ todos });
    }

    // No todos for today - check for incomplete todos from previous days
    const previousIncompleteSnapshot = await db
      .collection(COLLECTIONS.TODOS)
      .where("user_id", "==", userId)
      .where("completed", "==", false)
      .where("date", "<", today)
      .orderBy("date", "desc")
      .orderBy("created_at", "desc")
      .limit(20) // Reasonable limit
      .get();

    if (previousIncompleteSnapshot.empty) {
      // No previous incomplete todos, return empty
      return Response.json({ todos: [] });
    }

    // Carry over incomplete todos to today
    const now = new Date();
    const batch = db.batch();
    const carriedOverTodos: {
      id: string;
      content: string;
      completed: boolean;
      date: string;
      created_at: string;
      updated_at: string;
    }[] = [];

    for (const doc of previousIncompleteSnapshot.docs) {
      const data = doc.data();
      const newTodoRef = db.collection(COLLECTIONS.TODOS).doc();

      batch.set(newTodoRef, {
        user_id: userId,
        content: data.content,
        completed: false,
        date: today,
        created_at: now,
        updated_at: now,
        carried_from: doc.id, // Track origin for debugging
      });

      carriedOverTodos.push({
        id: newTodoRef.id,
        content: data.content,
        completed: false,
        date: today,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    }

    await batch.commit();

    return Response.json({ todos: carriedOverTodos });
  } catch (error) {
    console.error("Error fetching todos:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// POST - Create new todo
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { content, timezone } = await req.json();

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return new Response("Content is required", { status: 400 });
    }

    const now = new Date();
    const today = getTodayDate(timezone);

    const todoRef = await db.collection(COLLECTIONS.TODOS).add({
      user_id: session.user.id,
      content: content.trim(),
      completed: false,
      date: today,
      created_at: now,
      updated_at: now,
    });

    return Response.json({
      id: todoRef.id,
      content: content.trim(),
      completed: false,
      date: today,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  } catch (error) {
    console.error("Error creating todo:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
