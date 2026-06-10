import { ADD_MENU_ITEM_HASH } from '@/constants/categories.js'

export function clearAddMenuItemHash() {
  if (window.location.hash === ADD_MENU_ITEM_HASH) {
    const path = `${window.location.pathname}${window.location.search}`
    window.history.replaceState(null, '', path)
  }
}
