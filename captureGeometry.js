function mapSelectionToImage(selection, overlaySize, imageSize) {
  if (!selection || !overlaySize || !imageSize) {
    throw new TypeError('selection, overlaySize, and imageSize are required');
  }
  if (overlaySize.width <= 0 || overlaySize.height <= 0) {
    throw new RangeError('overlay dimensions must be greater than zero');
  }

  const scaleX = imageSize.width / overlaySize.width;
  const scaleY = imageSize.height / overlaySize.height;
  const x = Math.max(0, Math.round(selection.x * scaleX));
  const y = Math.max(0, Math.round(selection.y * scaleY));
  const width = Math.max(1, Math.round(selection.width * scaleX));
  const height = Math.max(1, Math.round(selection.height * scaleY));

  return {
    x: Math.min(x, Math.max(0, imageSize.width - 1)),
    y: Math.min(y, Math.max(0, imageSize.height - 1)),
    width: Math.min(width, Math.max(0, imageSize.width - x)),
    height: Math.min(height, Math.max(0, imageSize.height - y))
  };
}

module.exports = { mapSelectionToImage };
