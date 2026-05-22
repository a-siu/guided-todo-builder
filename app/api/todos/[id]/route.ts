import { NextRequest, NextResponse } from "next/server";
import { todoService } from "@/lib/services/todo.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const todos = await todoService.getTodos();
    const todo = todos.find((t) => t.id === params.id);

    if (!todo) {
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
  try {
    const body = await request.json();
    const result = await todoService.updateTodo(params.id, body);

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
  try {
    const result = await todoService.deleteTodo(params.id);

    if (result.error === "Todo not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ todo: result.todo });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
