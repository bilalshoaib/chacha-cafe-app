/**
 * Starter category sets offered when a café is created.
 *
 * A new tenant should reach a usable menu screen without inventing its own
 * taxonomy first, but nothing here is permanent — categories live in the
 * database from the moment they are seeded, and the owner renames, reorders
 * and deletes them from their own settings.
 *
 * "Start empty" is a real choice, not an omission: a café importing a menu
 * from a spreadsheet wants its own categories and nothing else.
 */
export const STARTER_MENUS = [
  {
    id: 'cafe',
    label: 'Café',
    description: 'Coffee, tea, pastries and light food',
    categories: [
      { key: 'coffee', label: 'Coffee', icon: '☕', color: '#6f4e37' },
      { key: 'tea', label: 'Tea', icon: '🫖', color: '#1f7a5c' },
      { key: 'cold-drinks', label: 'Cold drinks', icon: '🥤', color: '#1f7a3c' },
      { key: 'pastries', label: 'Pastries', icon: '🥐', color: '#b8860b' },
      { key: 'sandwiches', label: 'Sandwiches', icon: '🥪', color: '#c45c26' },
    ],
  },
  {
    id: 'fast-food',
    label: 'Fast food',
    description: 'Burgers, pizza, fried chicken and sides',
    categories: [
      { key: 'burger', label: 'Burgers', icon: '🍔', color: '#c45c26' },
      { key: 'pizza', label: 'Pizzas', icon: '🍕', color: '#8a1f1f' },
      { key: 'fries', label: 'Fries', icon: '🍟', color: '#b8860b' },
      { key: 'wings', label: 'Wings', icon: '🍗', color: '#6b3fa0' },
      { key: 'shawarma', label: 'Shawarmas', icon: '🌯', color: '#1f7a5c' },
      { key: 'drinks', label: 'Cold drinks', icon: '🥤', color: '#1f7a3c' },
    ],
  },
  {
    id: 'bakery',
    label: 'Bakery',
    description: 'Bread, cakes and sweets',
    categories: [
      { key: 'bread', label: 'Bread', icon: '🍞', color: '#b8860b' },
      { key: 'cakes', label: 'Cakes', icon: '🍰', color: '#a01f3a' },
      { key: 'pastries', label: 'Pastries', icon: '🥐', color: '#c45c26' },
      { key: 'cookies', label: 'Cookies', icon: '🍪', color: '#6f4e37' },
      { key: 'drinks', label: 'Drinks', icon: '🥤', color: '#1f7a3c' },
    ],
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    description: 'Starters, mains, sides and desserts',
    categories: [
      { key: 'starters', label: 'Starters', icon: '🥗', color: '#1f7a5c' },
      { key: 'mains', label: 'Main courses', icon: '🍛', color: '#8a1f1f' },
      { key: 'grill', label: 'Grill', icon: '🍢', color: '#c45c26' },
      { key: 'sides', label: 'Sides', icon: '🍚', color: '#b8860b' },
      { key: 'desserts', label: 'Desserts', icon: '🍮', color: '#a01f3a' },
      { key: 'drinks', label: 'Drinks', icon: '🥤', color: '#1f7a3c' },
    ],
  },
  { id: 'empty', label: 'Start empty', description: 'Add your own categories as you build the menu', categories: [] },
]

export function starterMenu(id) {
  return STARTER_MENUS.find((m) => m.id === id) ?? STARTER_MENUS.find((m) => m.id === 'empty')
}
