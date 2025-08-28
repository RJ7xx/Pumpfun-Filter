import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mint = searchParams.get("mint")

  if (!mint) {
    return NextResponse.json({ error: "Mint parameter is required" }, { status: 400 })
  }

  try {
    const response = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    // Return only the fields we need
    return NextResponse.json({
      image_uri: data.image_uri,
      usd_market_cap: data.usd_market_cap,
    })
  } catch (error) {
    console.error("Error fetching pump.fun data:", error)
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 })
  }
}
