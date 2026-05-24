import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { recurringService } from "@/lib/services/recurring.service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const recurring = await recurringService.detectRecurring(session.user.id);
    return NextResponse.json({ recurring });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
