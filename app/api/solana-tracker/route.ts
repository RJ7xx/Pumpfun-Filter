export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mint = searchParams.get("mint")

  if (!mint) {
    return new Response("Missing mint parameter", { status: 400 })
  }

  try {
    const response = await fetch(`https://data.solanatracker.io/tokens/${mint}/ath`, {
      headers: {
        "x-api-key": process.env.SOLANA_TRACKER_API_KEY!,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return Response.json(data)
  } catch (error) {
    console.error("Error fetching Solana Tracker data:", error)
    return new Response("Error fetching token data", { status: 500 })
  }
}
