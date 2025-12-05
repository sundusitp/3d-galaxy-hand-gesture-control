import './globals.css'

export const metadata = {
  title: 'Galaxy Hand Control',
  description: 'Control a 3D galaxy with your hand gestures',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}