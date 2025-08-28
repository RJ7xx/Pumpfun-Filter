"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Loader2, Copy } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface Token {
  mint: string
  name: string
  symbol: string
  createdAt: string
  image_uri?: string
  usd_market_cap?: number
  ath_market_cap?: number
  description?: string // Added description field
  isHovered?: boolean
  isLoadingHoverData?: boolean
}

interface PumpData {
  image_uri: string
  usd_market_cap: number
  description: string // Added description field
}

interface SolanaTrackerData {
  highest_market_cap: number
}

export function TokenExplorer() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [minAthMarketCap, setMinAthMarketCap] = useState<string>("")
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [totalCount, setTotalCount] = useState<number>(0)
  const observerRef = useRef<HTMLDivElement>(null)

  const ITEMS_PER_PAGE = 30

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const fetchPumpData = async (mint: string): Promise<PumpData | null> => {
    try {
      const response = await fetch(`/api/pump-data?mint=${mint}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const text = await response.text()
      if (!text) return null
      return JSON.parse(text)
    } catch (error) {
      console.error(`Error fetching pump data for ${mint}:`, error)
      return null
    }
  }

  const fetchSolanaTrackerData = async (mint: string): Promise<SolanaTrackerData | null> => {
    try {
      const response = await fetch(`/api/solana-tracker?mint=${mint}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error(`Error fetching Solana Tracker data for ${mint}:`, error)
      return null
    }
  }

  const handleTokenHover = async (tokenMint: string) => {
    const token = tokens.find((t) => t.mint === tokenMint)
    if (!token || token.isHovered || token.isLoadingHoverData) return

    setTokens((prev) => prev.map((t) => (t.mint === tokenMint ? { ...t, isLoadingHoverData: true } : t)))

    const pumpData = await fetchPumpData(tokenMint)

    setTokens((prev) =>
      prev.map((t) =>
        t.mint === tokenMint
          ? {
              ...t,
              image_uri: pumpData?.image_uri,
              usd_market_cap: pumpData?.usd_market_cap,
              description: pumpData?.description, // Added description field
              isHovered: true,
              isLoadingHoverData: false,
            }
          : t,
      ),
    )
  }

  const fetchTokens = async (isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setTokens([])
      setOffset(0)
      setHasMore(true)
    }

    try {
      const currentOffset = isLoadMore ? offset : 0
      const minAthMarketCapNum = minAthMarketCap ? Number(minAthMarketCap) : 0
      const needsAthFiltering = minAthMarketCapNum > 0

      if (!isLoadMore && !needsAthFiltering) {
        let countQuery = supabase.from("tokens").select("*", { count: "exact", head: true })

        if (startDate) {
          const startTimestamp = Math.floor(startDate.getTime() / 1000)
          countQuery = countQuery.gte("createdAt", startTimestamp)
        }

        if (endDate) {
          const endTimestamp = Math.floor((endDate.getTime() + 86400000) / 1000)
          countQuery = countQuery.lt("createdAt", endTimestamp)
        }

        const { count } = await countQuery
        setTotalCount(count || 0)
      }

      let query = supabase.from("tokens").select("mint, name, symbol, createdAt")

      if (startDate) {
        const startTimestamp = Math.floor(startDate.getTime() / 1000)
        query = query.gte("createdAt", startTimestamp)
      }

      if (endDate) {
        const endTimestamp = Math.floor((endDate.getTime() + 86400000) / 1000)
        query = query.lt("createdAt", endTimestamp)
      }

      query = query.order("createdAt", { ascending: sortOrder === "oldest" })

      const fetchSize = needsAthFiltering ? ITEMS_PER_PAGE * 3 : ITEMS_PER_PAGE
      const from = currentOffset
      const to = from + fetchSize - 1
      query = query.range(from, to)

      const { data, error } = await query

      if (error) {
        console.error("Error fetching tokens:", error)
        return
      }

      if (!data || data.length === 0) {
        setHasMore(false)
        return
      }

      const processedTokens = data.map((token) => ({
        ...token,
        createdAt: new Date(Number.parseInt(token.createdAt.toString()) * 1000).toISOString(),
      }))

      let filteredTokens = processedTokens

      if (needsAthFiltering) {
        const tokensWithAth: Token[] = []

        for (const token of processedTokens) {
          const solanaTrackerData = await fetchSolanaTrackerData(token.mint)
          const tokenWithAth = {
            ...token,
            ath_market_cap: solanaTrackerData?.highest_market_cap,
          }

          if (tokenWithAth.ath_market_cap && tokenWithAth.ath_market_cap >= minAthMarketCapNum) {
            tokensWithAth.push(tokenWithAth)
          }

          await delay(100)
        }

        filteredTokens = tokensWithAth

        if (!isLoadMore) {
          // For initial load with ATH filtering, we need to estimate total count
          // This is a rough estimate based on the filtering ratio
          const filterRatio = filteredTokens.length / processedTokens.length
          let estimatedTotal = 0

          if (filterRatio > 0) {
            // Get total count without ATH filter first
            let countQuery = supabase.from("tokens").select("*", { count: "exact", head: true })

            if (startDate) {
              const startTimestamp = Math.floor(startDate.getTime() / 1000)
              countQuery = countQuery.gte("createdAt", startTimestamp)
            }

            if (endDate) {
              const endTimestamp = Math.floor((endDate.getTime() + 86400000) / 1000)
              countQuery = countQuery.lt("createdAt", endTimestamp)
            }

            const { count } = await countQuery
            estimatedTotal = Math.round((count || 0) * filterRatio)
          }

          setTotalCount(estimatedTotal)
        }
      }

      if (isLoadMore) {
        setTokens((prev) => [...prev, ...filteredTokens])
      } else {
        setTokens(filteredTokens)
      }

      setOffset(currentOffset + data.length)
      setHasMore(data.length === fetchSize)
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const lastTokenRef = useCallback(
    (node: HTMLDivElement) => {
      if (loading || loadingMore) return
      if (observerRef.current) observerRef.current.disconnect()

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchTokens(true)
        }
      })

      if (node) observerRef.current.observe(node)
    },
    [loading, loadingMore, hasMore],
  )

  useEffect(() => {
    fetchTokens()
  }, [sortOrder])

  const handleFilter = () => {
    setTokens([])
    setOffset(0)
    fetchTokens()
  }

  const handleReset = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    setMinAthMarketCap("")
    setSortOrder("newest")
    setTokens([])
    setOffset(0)
    fetchTokens()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getShortMint = (mint: string) => {
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`
  }

  const formatMarketCap = (marketCap: number | undefined) => {
    if (!marketCap) return "N/A"
    if (marketCap >= 1000000) {
      return `$${(marketCap / 1000000).toFixed(2)}M`
    } else if (marketCap >= 1000) {
      return `$${(marketCap / 1000).toFixed(2)}k`
    } else {
      return `$${marketCap.toFixed(2)}`
    }
  }

  const getTruncatedDescription = (description: string) => {
    if (description.length <= 8) return description
    return description.slice(0, 8) + "..."
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-8 max-w-7xl font-sans">
        <Card className="border border-gray-300 shadow-none" style={{ borderWidth: "1.5px" }}>
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl font-bold font-sans">Filters & Sorting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label className="font-sans">Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal font-sans text-sm",
                        !startDate && "text-muted-foreground",
                      )}
                    >
                      {startDate ? format(startDate, "PPP") : "Earliest Creation Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="font-sans">End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal font-sans text-sm",
                        !endDate && "text-muted-foreground",
                      )}
                    >
                      {endDate ? format(endDate, "PPP") : "Latest Creation Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="font-sans">Minimum ATH Market Cap</Label>
                <Input
                  type="number"
                  value={minAthMarketCap}
                  onChange={(e) => setMinAthMarketCap(e.target.value)}
                  className="font-sans text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-sans">Sort By</Label>
                <Select value={sortOrder} onValueChange={(value: "newest" | "oldest") => setSortOrder(value)}>
                  <SelectTrigger className="w-full font-sans text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest" className="font-sans">
                      Newest
                    </SelectItem>
                    <SelectItem value="oldest" className="font-sans">
                      Oldest
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleFilter} className="font-sans">
                Apply
              </Button>
              <Button onClick={handleReset} variant="outline" className="bg-transparent font-sans">
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold font-sans">Tokens</h2>
            <Badge variant="secondary" className="text-sm px-3 py-1 font-sans">
              {totalCount.toLocaleString()} results
            </Badge>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card
                  key={i}
                  className="animate-pulse border border-gray-300 shadow-none"
                  style={{ borderWidth: "1.5px" }}
                >
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="h-5 bg-muted rounded w-3/4"></div>
                      <div className="h-4 bg-muted rounded w-1/2"></div>
                      <div className="h-4 bg-muted rounded w-full"></div>
                      <div className="h-4 bg-muted rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {tokens.map((token, index) => (
                <Card
                  key={token.mint}
                  className="border border-gray-300 shadow-none hover:shadow-sm transition-all duration-200"
                  style={{ borderWidth: "1.5px" }}
                  ref={index === tokens.length - 1 ? lastTokenRef : null}
                  onMouseEnter={() => handleTokenHover(token.mint)}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center text-xl font-bold flex-shrink-0 overflow-hidden">
                        {token.isLoadingHoverData ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : token.image_uri ? (
                          <img
                            src={token.image_uri || "/placeholder.svg"}
                            alt={token.name}
                            className="w-full h-full object-cover rounded-lg"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = "none"
                              const parent = target.parentElement
                              if (parent) {
                                parent.textContent = token.name ? token.name.charAt(0).toUpperCase() : "?"
                              }
                            }}
                          />
                        ) : (
                          <span>{token.name ? token.name.charAt(0).toUpperCase() : "?"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-foreground truncate font-sans" title={token.name}>
                            {token.name || "Unnamed Token"}
                          </h3>
                          <Badge variant="secondary" className="text-xs font-medium font-sans">
                            {token.symbol || "N/A"}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div>
                            <span className="font-semibold text-muted-foreground font-sans">Created At: </span>
                            <span className="text-foreground font-sans">
                              {format(new Date(token.createdAt), "dd/MM/yyyy")}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold text-muted-foreground font-sans">Market Cap: </span>
                            <span className="text-foreground font-sans">{formatMarketCap(token.usd_market_cap)}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-muted-foreground font-sans">All-time High: </span>
                            <span className="text-foreground font-sans">{formatMarketCap(token.ath_market_cap)}</span>
                          </div>
                          {token.description && (
                            <div>
                              <span className="font-semibold text-muted-foreground font-sans">Description: </span>
                              {token.description.length > 8 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-foreground font-sans text-xs leading-relaxed cursor-help">
                                      {getTruncatedDescription(token.description)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">{token.description}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-foreground font-sans text-xs leading-relaxed">
                                  {token.description}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-sans">{getShortMint(token.mint)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => copyToClipboard(token.mint)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <hr className="border-gray-200 w-full my-4" />
                    <div className="flex justify-center gap-2 flex-wrap">
                      <Badge
                        className="text-white cursor-pointer hover:opacity-90 font-sans"
                        style={{ backgroundColor: "#c74ae3" }}
                        onClick={() => window.open(`https://solscan.io/token/${token.mint}`, "_blank")}
                      >
                        Solscan.io
                      </Badge>
                      <Badge
                        className="text-white cursor-pointer hover:opacity-90 font-sans"
                        style={{ backgroundColor: "#53d793" }}
                        onClick={() => window.open(`https://pump.fun/coins/${token.mint}`, "_blank")}
                      >
                        Pump.fun
                      </Badge>
                      <Badge
                        className="text-white cursor-pointer hover:opacity-90 font-sans"
                        style={{ backgroundColor: "#526fff" }}
                        onClick={() => window.open(`https://axiom.trade/t/${token.mint}`, "_blank")}
                      >
                        Axiom.trade
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {loadingMore && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-lg font-sans">Loading more tokens...</span>
              </div>
            </div>
          )}

          {!hasMore && tokens.length > 0 && (
            <div className="text-center py-12">
              <div className="space-y-2">
                <p className="text-lg font-medium text-muted-foreground font-sans">You've reached the end!</p>
                <p className="text-sm text-muted-foreground font-sans">No more tokens to load</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
