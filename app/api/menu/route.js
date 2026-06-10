import { NextResponse } from 'next/server'
import { loadMenu } from '@/lib/repositories/menuRepository'

export async function GET() {
  const menu = await loadMenu()
  return NextResponse.json(menu)
}
