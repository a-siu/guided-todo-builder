import { NextRequest, NextResponse } from "next/server";
import { todoService } from "@/lib/services/todo.service";
import { auditService } from "@/lib/services/audit.service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get("includeDeleted") === "true";

  try {
    const todos = includeDeleted
      ? await auditService.getAllTodos()
      : await todoService.getTodos();

    return NextResponse.json({ todos });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await todoService.createTodo({ title: body.title });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ todo: result.todo }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
