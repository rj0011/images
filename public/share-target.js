// Receives files shared from other Android apps ("Share" -> Lumina)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return
  event.respondWith((async () => {
    try {
      const form = await event.request.formData()
      const files = form.getAll('media')
      const cache = await caches.open('lumina-share-inbox')
      let i = 0
      for (const f of files) {
        if (!f || !f.size) continue
        await cache.put(`./__inbox/${Date.now()}-${i++}`, new Response(f, {
          headers: { 'x-name': encodeURIComponent(f.name || 'shared'), 'content-type': f.type || 'application/octet-stream', 'x-modified': String(f.lastModified || Date.now()) }
        }))
      }
    } catch (e) { /* ignore */ }
    return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303)
  })())
})
