import { createServerApp } from './app'

const port = Number(process.env.PORT ?? 8790)

createServerApp().listen(port, () => {
  console.log(`Voice drawing API listening on http://127.0.0.1:${port}`)
})
