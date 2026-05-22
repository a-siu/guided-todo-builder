import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { todoService } from "@/lib/services/todo.service";
import { auditService } from "@/lib/services/audit.service";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get("includeDeleted") === "true";

  try {
    const todos = includeDeleted
      ? await auditService.getAllTodos(session.user.id)
      : await todoService.getTodos(session.user.id);

    return NextResponse.json({ todos });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title } = await request.json();
    const result = await todoService.createTodo({ title }, session.user.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ todo: result.todo }, { status: 201 });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
