import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const repoRawBase = 'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main'
const outRoot = path.resolve('public/vendor/excalidraw-libraries')
const concurrency = Number(process.env.EXCALIDRAW_SYNC_CONCURRENCY ?? 8)

async function main() {
  await mkdir(outRoot, { recursive: true })
  const [libraries, license, readme] = await Promise.all([
    fetchJson(`${repoRawBase}/libraries.json`),
    fetchText(`${repoRawBase}/LICENSE`),
    fetchText(`${repoRawBase}/README.md`),
  ])

  const tasks = libraries.map((library) => async () => {
    const localPath = `libraries/${library.source}`
    const url = `${repoRawBase}/libraries/${library.source}`
    const absolutePath = path.join(outRoot, localPath)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    const body = await fetchText(url)
    await writeFile(absolutePath, body)
    return {
      id: library.id,
      name: library.name,
      description: library.description,
      authors: library.authors ?? [],
      source: library.source,
      localPath,
      preview: library.preview,
      created: library.created,
      updated: library.updated,
      version: library.version,
      license: 'MIT',
    }
  })

  const synced = await runPool(tasks, concurrency)
  const index = {
    source: 'https://github.com/excalidraw/excalidraw-libraries',
    syncedAt: new Date().toISOString(),
    license: 'MIT',
    count: synced.length,
    libraries: synced,
  }

  await writeFile(path.join(outRoot, 'libraries.index.json'), `${JSON.stringify(index, null, 2)}\n`)
  await writeFile(path.join(outRoot, 'LICENSE'), license)
  await writeFile(path.join(outRoot, 'README.md'), readme)
  console.log(`Synced ${synced.length} Excalidraw libraries to ${outRoot}`)
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.json()
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.text()
}

async function runPool(tasks, limit) {
  const results = []
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++
      results[currentIndex] = await tasks[currentIndex]()
      if ((currentIndex + 1) % 25 === 0) console.log(`Downloaded ${currentIndex + 1}/${tasks.length}`)
    }
  })
  await Promise.all(workers)
  return results
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
