import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { todoService } from "@/lib/services/todo.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const todo = await todoService.getTodoById(params.id);

    if (!todo || todo.userId !== session.user.id) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    return NextResponse.json({ todo });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await todoService.updateTodo(params.id, body, session.user.id);

    if (result.error === "Todo not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ todo: result.todo });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await todoService.deleteTodo(params.id, session.user.id);

    if (result.error === "Todo not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ todo: result.todo });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
