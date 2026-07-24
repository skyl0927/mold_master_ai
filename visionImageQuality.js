const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const issue = (code, severity, message, recommendation) => ({
  code,
  severity,
  message,
  recommendation
});

const luminance = (red, green, blue) =>
  (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);

const sampleGrayscale = ({ width, height, data }) => {
  const stride = Math.max(1, Math.ceil(Math.max(width, height) / 320));
  const sampleWidth = Math.ceil(width / stride);
  const sampleHeight = Math.ceil(height / stride);
  const values = new Float32Array(sampleWidth * sampleHeight);
  let sum = 0;
  let squaredSum = 0;
  let dark = 0;
  let bright = 0;

  for (let sampleY = 0; sampleY < sampleHeight; sampleY += 1) {
    const sourceY = Math.min(height - 1, sampleY * stride);
    for (let sampleX = 0; sampleX < sampleWidth; sampleX += 1) {
      const sourceX = Math.min(width - 1, sampleX * stride);
      const sourceOffset = ((sourceY * width) + sourceX) * 4;
      const value = luminance(
        data[sourceOffset],
        data[sourceOffset + 1],
        data[sourceOffset + 2]
      );
      const sampleOffset = (sampleY * sampleWidth) + sampleX;
      values[sampleOffset] = value;
      sum += value;
      squaredSum += value * value;
      if (value <= 12) dark += 1;
      if (value >= 243) bright += 1;
    }
  }

  const total = values.length || 1;
  const mean = sum / total;
  const variance = Math.max(0, (squaredSum / total) - (mean * mean));
  return {
    values,
    width: sampleWidth,
    height: sampleHeight,
    mean,
    contrast: Math.sqrt(variance),
    darkRatio: dark / total,
    brightRatio: bright / total
  };
};

const laplacianVariance = sample => {
  if (sample.width < 3 || sample.height < 3) return 0;
  let count = 0;
  let sum = 0;
  let squaredSum = 0;
  for (let y = 1; y < sample.height - 1; y += 1) {
    for (let x = 1; x < sample.width - 1; x += 1) {
      const center = sample.values[(y * sample.width) + x];
      const laplacian =
        sample.values[((y - 1) * sample.width) + x]
        + sample.values[((y + 1) * sample.width) + x]
        + sample.values[(y * sample.width) + x - 1]
        + sample.values[(y * sample.width) + x + 1]
        - (4 * center);
      sum += laplacian;
      squaredSum += laplacian * laplacian;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, (squaredSum / count) - (mean * mean));
};

const evaluateVisionImageQuality = input => {
  const width = Number(input?.sourceWidth || input?.width || 0);
  const height = Number(input?.sourceHeight || input?.height || 0);
  const pixelWidth = Number(input?.width || 0);
  const pixelHeight = Number(input?.height || 0);
  const data = input?.data;
  const issues = [];

  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
    || !data
    || data.length < pixelWidth * pixelHeight * 4
  ) {
    return {
      status: 'reject',
      canAnalyze: false,
      score: 0,
      metrics: {
        width: Math.max(0, width),
        height: Math.max(0, height),
        megapixels: 0,
        meanLuminance: 0,
        contrast: 0,
        sharpness: 0,
        darkRatio: 0,
        brightRatio: 0
      },
      issues: [
        issue(
          'invalid_image',
          'reject',
          '이미지 픽셀을 읽을 수 없습니다.',
          '이미지를 다시 캡처하거나 지원되는 이미지 파일을 선택하세요.'
        )
      ]
    };
  }

  const sample = sampleGrayscale({ width: pixelWidth, height: pixelHeight, data });
  const sharpness = laplacianVariance(sample);
  const shortSide = Math.min(width, height);
  const pixels = width * height;

  if (shortSide < 160 || pixels < 40000) {
    issues.push(issue(
      'resolution_too_low',
      'reject',
      '결함 특징을 구분하기에 이미지 해상도가 너무 낮습니다.',
      '결함 부위를 더 가까이에서 촬영하고 짧은 변 320px 이상을 확보하세요.'
    ));
  } else if (shortSide < 480) {
    issues.push(issue(
      'resolution_low',
      'warn',
      '미세 결함 판정에 필요한 해상도가 부족할 수 있습니다.',
      '가능하면 결함 ROI를 확대해 다시 촬영하세요.'
    ));
  }

  if (sample.mean < 15 && sample.darkRatio >= 0.85) {
    issues.push(issue(
      'severely_underexposed',
      'reject',
      '사진이 지나치게 어두워 표면 특징을 확인할 수 없습니다.',
      '조명을 추가하고 노출을 높여 다시 촬영하세요.'
    ));
  } else if (sample.darkRatio >= 0.45) {
    issues.push(issue(
      'shadow_clipping',
      'warn',
      '어두운 영역에서 결함 특징이 손실될 수 있습니다.',
      '확산광을 추가하거나 촬영 각도를 변경하세요.'
    ));
  }

  if (sample.mean > 240 && sample.brightRatio >= 0.85) {
    issues.push(issue(
      'severely_overexposed',
      'reject',
      '사진이 지나치게 밝아 표면 특징을 확인할 수 없습니다.',
      '노출을 낮추고 반사를 줄여 다시 촬영하세요.'
    ));
  } else if (sample.brightRatio >= 0.35) {
    issues.push(issue(
      'highlight_clipping',
      'warn',
      '강한 반사 또는 과노출 영역이 결함을 가릴 수 있습니다.',
      '사광이나 확산광으로 촬영하고 플래시 직사를 피하세요.'
    ));
  }

  if (sample.contrast < 12) {
    issues.push(issue(
      'low_contrast',
      'warn',
      '제품 표면과 결함의 명암 차이가 작습니다.',
      '사광 또는 편광 조명을 사용해 표면 대비를 높이세요.'
    ));
  }
  if (sharpness < 30) {
    issues.push(issue(
      'possible_blur',
      'warn',
      '초점 불량 또는 세부 특징 부족 가능성이 있습니다.',
      '카메라를 고정하고 결함 부위에 초점을 맞춰 다시 촬영하세요.'
    ));
  }

  const rejected = issues.some(item => item.severity === 'reject');
  const warnings = issues.filter(item => item.severity === 'warn').length;
  const rejects = issues.filter(item => item.severity === 'reject').length;
  const score = clamp(100 - (rejects * 40) - (warnings * 12), 0, 100);

  return {
    status: rejected ? 'reject' : issues.length > 0 ? 'warn' : 'pass',
    canAnalyze: !rejected,
    score,
    metrics: {
      width,
      height,
      megapixels: round(pixels / 1000000),
      meanLuminance: round(sample.mean),
      contrast: round(sample.contrast),
      sharpness: round(sharpness),
      darkRatio: round(sample.darkRatio, 4),
      brightRatio: round(sample.brightRatio, 4)
    },
    issues
  };
};

const inspectVisionImageQuality = dataUrl => new Promise(resolve => {
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    resolve(evaluateVisionImageQuality({}));
    return;
  }

  const imageElement = new Image();
  imageElement.onload = () => {
    const maxDimension = 640;
    const scale = Math.min(
      1,
      maxDimension / Math.max(imageElement.naturalWidth, imageElement.naturalHeight)
    );
    const width = Math.max(1, Math.round(imageElement.naturalWidth * scale));
    const height = Math.max(1, Math.round(imageElement.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      resolve(evaluateVisionImageQuality({}));
      return;
    }
    context.drawImage(imageElement, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    resolve(evaluateVisionImageQuality({
      width,
      height,
      data: imageData.data,
      sourceWidth: imageElement.naturalWidth,
      sourceHeight: imageElement.naturalHeight
    }));
  };
  imageElement.onerror = () => resolve(evaluateVisionImageQuality({}));
  imageElement.src = dataUrl;
});

const formatVisionQualityMessage = report =>
  (report?.issues || [])
    .map(item => `${item.message} ${item.recommendation}`)
    .join(' ');

module.exports = {
  evaluateVisionImageQuality,
  formatVisionQualityMessage,
  inspectVisionImageQuality
};
