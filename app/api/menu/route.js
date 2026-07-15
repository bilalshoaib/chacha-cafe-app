import { NextResponse } from 'next/server'
import { loadMenu } from '@/lib/repositories/menuRepository'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function GET() {
  const menu = await loadMenu()
  return NextResponse.json(menu, { headers: corsHeaders })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
