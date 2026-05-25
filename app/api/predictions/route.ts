import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { predictionService } from "@/lib/services/prediction.service";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const currentPatternId = searchParams.get("currentPatternId") ?? undefined;
    const minFrequency = searchParams.get("minFrequency") ? Number(searchParams.get("minFrequency")) : undefined;
    const query = searchParams.get("query") ?? undefined;

    const predictions = await predictionService.predict(session.user.id, {
      currentPatternId,
      minFrequency,
      query,
    });

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
