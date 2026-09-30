import { toPng, toJpeg } from 'html-to-image'

export async function exportAsImage(element, filename = 'crickrida-card', format = 'png') {
  if (!element) throw new Error('No element provided')

  // Temporarily remove preview scaling for full-resolution capture
  const prevTransform = element.style.transform
  const prevTransformOrigin = element.style.transformOrigin
  element.style.transform = 'none'
  element.style.transformOrigin = 'top left'

  const options = {
    quality: 1,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#0C1210',
    width: element.scrollWidth,
    height: element.scrollHeight,
  }

  let dataUrl
  try {
    if (format === 'jpeg' || format === 'jpg') {
      dataUrl = await toJpeg(element, options)
    } else {
      dataUrl = await toPng(element, options)
    }
  } finally {
    // Restore preview scaling
    element.style.transform = prevTransform
    element.style.transformOrigin = prevTransformOrigin
  }

  return dataUrl
}

export function downloadImage(dataUrl, filename = 'crickrida-card') {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export async function copyToClipboard(element) {
  const dataUrl = await exportAsImage(element, 'crickrida-card', 'png')
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ])
}
