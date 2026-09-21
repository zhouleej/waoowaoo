/**
 * 主形象的 appearanceIndex 值。
 * 所有判断主/子形象的逻辑必须引用此常量，禁止硬编码数字。
 * 子形象的 appearanceIndex 从 PRIMARY_APPEARANCE_INDEX + 1 开始递增。
 */
export const PRIMARY_APPEARANCE_INDEX = 0

// 比例配置（nanobanana 支持的所有比例，按常用程度排序）
export const ASPECT_RATIO_CONFIGS: Record<string, { label: string; isVertical: boolean }> = {
  '16:9': { label: '16:9', isVertical: false },
  '9:16': { label: '9:16', isVertical: true },
  '1:1': { label: '1:1', isVertical: false },
  '3:2': { label: '3:2', isVertical: false },
  '2:3': { label: '2:3', isVertical: true },
  '4:3': { label: '4:3', isVertical: false },
  '3:4': { label: '3:4', isVertical: true },
  '5:4': { label: '5:4', isVertical: false },
  '4:5': { label: '4:5', isVertical: true },
  '21:9': { label: '21:9', isVertical: false },
}

// 配置页面使用的选项列表（从 ASPECT_RATIO_CONFIGS 派生）
export const VIDEO_RATIOS = Object.entries(ASPECT_RATIO_CONFIGS).map(([value, config]) => ({
  value,
  label: config.label
}))

// 获取比例配置
export function getAspectRatioConfig(ratio: string) {
  return ASPECT_RATIO_CONFIGS[ratio] || ASPECT_RATIO_CONFIGS['16:9']
}

export const ANALYSIS_MODELS = [
  { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite' },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' }
]

export const IMAGE_MODELS = [
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' }
]

// 图像模型选项（ 生成完整图片）
export const IMAGE_MODEL_OPTIONS = [
  { value: 'banana', label: 'Banana Pro (FAL)' },
  { value: 'banana-2', label: 'Banana 2 (FAL)' },
  { value: 'gemini-3-pro-image-preview', label: 'Banana (Google)' },
  { value: 'gemini-3-pro-image-preview-batch', label: 'Banana (Google Batch) 省50%' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' },
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'imagen-4.0-generate-001', label: 'Imagen 4.0 (Google)' },
  { value: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4.0 Ultra' },
  { value: 'imagen-4.0-fast-generate-001', label: 'Imagen 4.0 Fast' }
]

// Banana 模型分辨率选项（仅用于九宫格分镜图，单张生成固定2K）
export const BANANA_RESOLUTION_OPTIONS = [
  { value: '2K', label: '2K (推荐，快速)' },
  { value: '4K', label: '4K (高清，较慢)' }
]

// 支持分辨率选择的 Banana 模型
export const BANANA_MODELS = ['banana', 'banana-2', 'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview-batch']

export const VIDEO_MODELS = [
  { value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
  { value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
  { value: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance 1.0 Pro Fast' },
  { value: 'doubao-seedance-1-0-pro-fast-251015-batch', label: 'Seedance 1.0 Pro Fast (批量) 省50%' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428-batch', label: 'Seedance 1.0 Lite (批量) 省50%' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (批量) 省50%' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance 1.0 Pro (批量) 省50%' },
  { value: 'fal-wan25', label: 'Wan 2.6' },
  { value: 'fal-veo31', label: 'Veo 3.1 Fast' },
  { value: 'fal-sora2', label: 'Sora 2' },
  { value: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', label: 'Kling 2.5 Turbo Pro' },
  { value: 'fal-ai/kling-video/v3/standard/image-to-video', label: 'Kling 3 Standard' },
  { value: 'fal-ai/kling-video/v3/pro/image-to-video', label: 'Kling 3 Pro' }
]

// SeeDream 批量模型列表（使用 GPU 空闲时间，成本降低50%）
export const SEEDANCE_BATCH_MODELS = [
  'doubao-seedance-1-5-pro-251215-batch',
  'doubao-seedance-1-0-pro-250528-batch',
  'doubao-seedance-1-0-pro-fast-251015-batch',
  'doubao-seedance-1-0-lite-i2v-250428-batch',
]

// 支持生成音频的模型
export const AUDIO_SUPPORTED_MODELS = [
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-1-5-pro-251215',
  'doubao-seedance-1-5-pro-251215-batch',
]

// 首尾帧视频模型（能力权威来源是 standards/capabilities；此常量仅作静态兜底展示）
export const FIRST_LAST_FRAME_MODELS = [
  { value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0 (首尾帧)' },
  { value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast (首尾帧)' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro (首尾帧)' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (首尾帧/批量) 省50%' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro (首尾帧)' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance 1.0 Pro (首尾帧/批量) 省50%' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite (首尾帧)' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428-batch', label: 'Seedance 1.0 Lite (首尾帧/批量) 省50%' },
  { value: 'veo-3.1-generate-preview', label: 'Veo 3.1 (首尾帧)' },
  { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast (首尾帧)' }
]

export const VIDEO_RESOLUTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' }
]

export const TTS_RATES = [
  { value: '+0%', label: '正常速度 (1.0x)' },
  { value: '+20%', label: '轻微加速 (1.2x)' },
  { value: '+50%', label: '加速 (1.5x)' },
  { value: '+100%', label: '快速 (2.0x)' }
]

export const TTS_VOICES = [
  { value: 'zh-CN-YunxiNeural', label: '云希 (男声)', preview: '男' },
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女声)', preview: '女' },
  { value: 'zh-CN-YunyangNeural', label: '云扬 (男声)', preview: '男' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊 (女声)', preview: '女' }
]

export const ART_STYLES = [
  {
    value: 'premium-chinese-anime',
    label: '精致国漫',
    preview: '国',
    promptZh:
      '现代高质量国漫风格，精致二维动画美术，人物五官清晰立体，面部比例自然，发丝细节丰富，服装纹理精致，轮廓线干净锐利，细腻赛璐璐上色结合柔和渐变阴影，光影层次丰富，色彩通透高级，画面干净，构图具有电影感，背景细节完整，人物与场景融合自然，高质量商业动画质感，超清细节，保持人物造型、服装、发型、配色和整体美术风格在连续镜头中一致。',
    promptEn:
      'Premium modern Chinese anime style, sophisticated 2D animation aesthetics, clearly defined facial features, natural facial proportions, detailed hair strands and clothing textures, clean sharp outlines, refined cel shading combined with soft gradient shadows, rich lighting depth, elegant transparent colors, clean composition, cinematic framing, detailed backgrounds, natural character-environment integration, high-end commercial animation quality, ultra-detailed visuals, consistent character design, hairstyle, costume, color palette and overall art direction across consecutive shots.',
  },
  {
    value: 'japanese-anime',
    label: '日系动漫',
    preview: '日',
    promptZh:
      '现代高质量日系动漫风格，专业动画电影级二维作画，标准日系角色设计，清晰自然的五官，细腻发丝，高质量赛璐璐上色，干净流畅的线稿，柔和但具有层次感的阴影，明亮通透的色彩，精致背景美术，电影感构图与光影，画面清爽自然，具有高预算动画番剧和视觉小说CG质感，保持角色外观与画风连续一致。',
    promptEn:
      'High-quality modern Japanese anime style, professional 2D animated-film aesthetics, refined Japanese character design, clean facial features, detailed hair, premium cel shading, smooth and precise line art, soft layered shadows, bright transparent colors, detailed background art, cinematic composition and lighting, polished high-budget anime and visual-novel CG quality, consistent character appearance and visual style across shots.',
  },
  {
    value: 'shonen-anime',
    label: '热血少年漫',
    preview: '燃',
    promptZh:
      '高质量热血少年动漫风格，具有力量感的人物设计，锐利有张力的线条，清晰轮廓，强烈明暗对比，动态构图，夸张但自然的动作表现，速度感与冲击感明显，战斗场景具有强烈视觉张力，鲜明高饱和色彩，戏剧化光影，电影级动漫镜头语言，高质量二维赛璐璐动画质感。',
    promptEn:
      'High-quality shonen anime style, powerful character design, sharp energetic line art, strong silhouettes, dramatic contrast, dynamic composition, expressive action poses, strong sense of speed and impact, visually intense action scenes, vivid saturated colors, dramatic lighting, cinematic anime camera language, premium 2D cel-animation quality.',
  },
  {
    value: 'romance-anime',
    label: '唯美恋爱漫',
    preview: '恋',
    promptZh:
      '唯美日系恋爱动漫风格，人物造型精致柔美，五官清秀自然，细腻发丝和服装细节，柔和干净的线条，清透细腻的赛璐璐上色，低对比柔光，温暖自然的肤色，浪漫氛围光，柔和景深，空气感明显，画面清新通透，具有青春恋爱动画电影和视觉小说CG质感。',
    promptEn:
      'Beautiful Japanese romance anime style, elegant and delicate character design, natural refined facial features, detailed hair and clothing, soft clean line art, transparent cel shading, gentle low-contrast lighting, warm natural skin tones, romantic atmospheric light, soft depth of field, airy and refreshing visuals, premium youth-romance anime film and visual-novel CG aesthetics.',
  },
  {
    value: 'ancient-chinese-anime',
    label: '古风国漫',
    preview: '古',
    promptZh:
      '高质量中国古风动漫风格，东方人物审美，精致古代服饰与发饰，细腻丝绸和刺绣纹理，飘逸衣摆与长发，清晰优雅的二维线稿，细腻赛璐璐上色，东方古典配色，柔和体积光，山水、楼阁、庭院等背景具有中国传统美学，画面诗意唯美，电影级构图，高端国风动画质感。',
    promptEn:
      'High-quality ancient Chinese anime style, refined East Asian character aesthetics, elaborate traditional costumes and hair ornaments, detailed silk and embroidery textures, flowing garments and long hair, elegant clean 2D line art, sophisticated cel shading, classical Chinese color palette, soft volumetric lighting, traditional landscapes, pavilions and courtyards, poetic cinematic composition, premium Chinese animation quality.',
  },
  {
    value: 'xianxia-anime',
    label: '仙侠玄幻',
    preview: '仙',
    promptZh:
      '高质量东方仙侠玄幻动漫风格，精致东方角色设计，飘逸长发与仙侠服饰，复杂精美的服装纹理和配饰，灵气、法术、剑气等能量效果细腻自然，宏大的东方幻想场景，云海、仙山、古殿等环境充满层次，梦幻体积光，电影级光影，高动态范围，华丽但干净的画面，高端国漫电影质感。',
    promptEn:
      'Premium Chinese xianxia fantasy anime style, sophisticated East Asian character design, flowing long hair and fantasy robes, intricate costume textures and accessories, refined spiritual energy, magic and sword-aura effects, grand Eastern fantasy environments, cloud seas, immortal mountains and ancient temples, dreamy volumetric lighting, cinematic illumination, high dynamic range, spectacular yet clean premium animated-film quality.',
  },
  {
    value: 'wuxia-ink',
    label: '水墨武侠',
    preview: '墨',
    promptZh:
      '现代东方水墨武侠动画风格，中国传统水墨画与现代二维动画融合，富有表现力的毛笔线条，墨色浓淡变化明显，大面积留白，山水意境深远，人物轮廓潇洒利落，局部精细上色，黑白灰为主并辅以克制的传统色彩，墨迹与动作轨迹自然融合，具有诗意、力量感和电影构图。',
    promptEn:
      'Modern Chinese ink-wash wuxia animation style, combining traditional Chinese ink painting with contemporary 2D animation, expressive brush strokes, rich ink gradients, intentional negative space, atmospheric landscapes, elegant dynamic character silhouettes, selective refined coloring, restrained traditional palette, natural integration of ink trails with motion, poetic yet powerful cinematic composition.',
  },
  {
    value: 'webtoon',
    label: '韩漫Webtoon',
    preview: '韩',
    promptZh:
      '现代高质量韩漫Webtoon风格，精致时尚的人物设计，修长自然的人体比例，漂亮清晰的五官，细腻发型和服饰，干净锐利的线稿，平滑渐变上色，柔和皮肤质感，现代商业插画光影，高颜值角色表现，背景整洁精致，画面具有现代都市漫画和高质量Webtoon视觉效果。',
    promptEn:
      'Premium modern Korean webtoon style, fashionable refined character design, elegant natural body proportions, attractive clean facial features, detailed hairstyles and clothing, crisp line art, smooth gradient coloring, soft skin rendering, polished commercial illustration lighting, visually appealing characters, clean detailed backgrounds, premium contemporary webtoon aesthetics.',
  },
  {
    value: 'american-comic',
    label: '美式漫画',
    preview: '美',
    promptZh:
      '现代高质量美式漫画风格，强烈而清晰的墨线轮廓，具有力量感的人物造型，明显的明暗分区和高对比阴影，丰富的漫画笔触与细节，动态透视构图，具有冲击力的动作表现，浓郁鲜明的色彩，戏剧化电影光影，现代超级英雄漫画与图像小说质感。',
    promptEn:
      'High-quality modern American comic-book style, bold clean ink outlines, powerful character silhouettes, strong light-shadow separation, high-contrast shading, rich comic rendering details, dynamic perspective composition, impactful action poses, vivid colors, dramatic cinematic lighting, polished modern superhero comic and graphic-novel aesthetics.',
  },
  {
    value: 'semi-realistic-anime',
    label: '半写实动漫',
    preview: '半',
    promptZh:
      '高级半写实动漫风格，融合真实人体结构与动漫角色美学，五官精致自然，真实但经过美化的皮肤质感，细腻发丝，服装材质清晰，轮廓柔和干净，二维插画与三维光影融合，电影级光照，真实景深，高级色彩分级，既保持动漫角色辨识度又具有真实电影质感。',
    promptEn:
      'Premium semi-realistic anime style, blending realistic anatomy with anime aesthetics, refined natural facial features, realistic yet beautified skin texture, detailed hair strands, clearly rendered clothing materials, soft clean contours, fusion of 2D illustration and dimensional lighting, cinematic illumination, realistic depth of field, sophisticated color grading, preserving anime identity with cinematic realism.',
  },
  {
    value: 'cinematic-realistic',
    label: '电影真人',
    preview: '影',
    promptZh:
      '真实电影级视觉风格，真实人物比例和自然面部特征，真实皮肤纹理、毛发和服装材质，物理真实的光照与阴影，自然景深，电影镜头质感，高动态范围，精细环境细节，专业电影布光，高级电影调色，画面真实但经过艺术化处理，避免塑料感和过度磨皮，具有高预算影视剧画面质感。',
    promptEn:
      'Photorealistic cinematic visual style, realistic human proportions and natural facial features, authentic skin, hair and clothing textures, physically realistic lighting and shadows, natural depth of field, cinematic lens rendering, high dynamic range, detailed environments, professional film lighting, sophisticated cinematic color grading, realistic yet artistically polished, avoiding plastic skin and excessive smoothing, high-budget film and television production quality.',
  },
  {
    value: '3d-animation',
    label: '3D国漫',
    preview: '3D',
    promptZh:
      '高质量三维国漫动画风格，精致三维人物建模，东方角色审美，细腻自然的皮肤材质，真实发丝系统，精美服装布料和饰品材质，电影级PBR渲染，柔和全局光照，精致体积光和环境光，真实景深，高质量三维动画电影构图，画面精致华丽，避免廉价游戏建模感。',
    promptEn:
      'Premium 3D Chinese animation style, sophisticated 3D character modeling with East Asian aesthetics, detailed natural skin materials, realistic hair simulation, refined fabric and accessory materials, cinematic PBR rendering, soft global illumination, polished volumetric and environmental lighting, realistic depth of field, high-quality animated-film composition, elegant premium visuals, avoiding cheap game-like rendering.',
  },
  {
    value: 'stylized-3d',
    label: '3D卡通',
    preview: '卡',
    promptZh:
      '高质量风格化三维动画风格，具有亲和力的卡通角色设计，适度夸张的人物比例和表情，圆润干净的几何造型，细腻材质，柔和全局光照，丰富但协调的色彩，电影级三维动画布光，清晰的视觉层级，生动自然的表情与姿态，高预算三维动画电影质感。',
    promptEn:
      'High-quality stylized 3D animation, appealing cartoon character design, moderately exaggerated proportions and expressions, clean rounded geometry, refined materials, soft global illumination, rich harmonious colors, cinematic 3D animation lighting, clear visual hierarchy, expressive natural poses and facial expressions, premium animated-feature quality.',
  },
  {
    value: 'cyberpunk-anime',
    label: '赛博朋克',
    preview: '赛',
    promptZh:
      '高质量赛博朋克动漫风格，未来都市与高科技视觉设计，精致二维动漫人物，霓虹灯光与电子广告牌，复杂城市背景，冷暖霓虹色彩对比，雨夜反射、薄雾与体积光效果，机械与电子细节丰富，电影级构图和高对比光影，具有未来感、科技感和高级动画电影质感。',
    promptEn:
      'High-quality cyberpunk anime style, futuristic urban and high-tech visual design, refined 2D anime characters, neon lighting and electronic signage, complex city environments, contrasting neon color temperatures, rainy reflections, haze and volumetric lighting, detailed mechanical and electronic elements, cinematic composition and high-contrast lighting, premium futuristic animated-film aesthetics.',
  },
  {
    value: 'dark-fantasy',
    label: '暗黑幻想',
    preview: '暗',
    promptZh:
      '高质量暗黑幻想动漫风格，神秘压迫的幻想世界，精致人物设计，复杂服装与盔甲细节，古老建筑和遗迹环境，深沉低饱和配色，强烈明暗对比，雾气、尘埃和体积光营造氛围，戏剧化构图，史诗感场景，高级电影级动漫渲染，画面黑暗但主体清晰可辨。',
    promptEn:
      'Premium dark-fantasy anime style, mysterious oppressive fantasy world, sophisticated character design, intricate clothing and armor details, ancient architecture and ruins, deep desaturated palette, dramatic light-shadow contrast, atmospheric fog, dust and volumetric lighting, theatrical composition, epic environments, cinematic anime rendering, dark atmosphere while keeping subjects clearly readable.',
  },
  {
    value: 'retro-anime',
    label: '复古动漫',
    preview: '复',
    promptZh:
      '经典复古二维动漫风格，具有80至90年代动画美术特征，手绘线条，自然轻微的线稿变化，传统赛璐璐上色，有限但协调的色彩层次，复古胶片颗粒和轻微色彩偏移，怀旧动画背景，经典人物设计，画面具有传统手绘动画和老电影胶片质感，同时保持高清输出。',
    promptEn:
      'Classic retro 2D anime style inspired by 1980s–1990s animation, hand-drawn line work with subtle natural variation, traditional cel coloring, limited yet harmonious color layers, subtle film grain and color shift, nostalgic painted backgrounds, classic character design, authentic hand-drawn animation and vintage film aesthetics while retaining high-resolution output.',
  },
  // 保留历史值，确保旧项目、用户偏好和已入库资产仍可继续编辑与生成。
  {
    value: 'chinese-comic',
    label: '经典国漫',
    preview: '漫',
    promptZh:
      '现代高质量二维国漫风格，角色设计清晰，线条锐利干净，赛璐璐上色自然，细节丰富精致，色彩饱满通透，人物与场景质感统一，画面干净，保持角色造型和整体画风连续一致。',
    promptEn:
      'High-quality modern 2D Chinese animation style, clearly defined character design, clean sharp line art, natural cel shading, rich refined details, vivid transparent colors, unified character and environment rendering, clean visuals, consistent character appearance and art direction across shots.',
  },
  {
    value: 'realistic',
    label: '自然写实',
    preview: '实',
    promptZh:
      '自然写实视觉风格，真实人物比例和自然面部特征，清晰的皮肤、毛发与服装材质，符合现实规律的光照和阴影，自然景深，真实环境细节，色彩饱满通透，画面干净精致，保持人物外观与整体视觉风格一致。',
    promptEn:
      'Natural realistic visual style, authentic human proportions and facial features, clear skin, hair and clothing materials, physically plausible lighting and shadows, natural depth of field, realistic environmental detail, rich transparent colors, clean refined image quality, consistent character appearance and overall visual direction.',
  },
] as const

export type ArtStyleValue = (typeof ART_STYLES)[number]['value']

export function isArtStyleValue(value: unknown): value is ArtStyleValue {
  return typeof value === 'string' && ART_STYLES.some((style) => style.value === value)
}

/**
 * 🔥 实时从 ART_STYLES 常量获取风格 prompt
 * 这是获取风格 prompt 的唯一正确方式，确保始终使用最新的常量定义
 * 
 * @param artStyle - 风格标识符，如 'realistic', 'american-comic' 等
 * @returns 对应的风格 prompt，如果找不到则返回空字符串
 */
export function getArtStylePrompt(
  artStyle: string | null | undefined,
  locale: 'zh' | 'en',
): string {
  if (!artStyle) return ''
  const style = ART_STYLES.find(s => s.value === artStyle)
  if (!style) return ''
  return locale === 'en' ? style.promptEn : style.promptZh
}

// 角色形象生成的系统后缀（始终添加到提示词末尾，不显示给用户）- 左侧面部特写+右侧三视图
export const CHARACTER_PROMPT_SUFFIX = '角色设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是角色的正面特写（如果是人类则展示完整正脸，如果是动物/生物则展示最具辨识度的正面形态）；【右侧区域】占约2/3宽度，是角色三视图横向排列（从左到右依次为：正面全身、侧面全身、背面全身），三视图高度一致。纯白色背景，无其他元素。'

// 道具图片生成的系统后缀（固定白底三视图资产图）
export const PROP_PROMPT_SUFFIX = '道具设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是道具主体的主视图特写；【右侧区域】占约2/3宽度，是同一道具的三视图横向排列（从左到右依次为：正面、侧面、背面），三视图高度一致。纯白色背景，主体居中完整展示，无人物、无手部、无桌面陈设、无环境背景、无其他元素。'

// 场景图片生成的系统后缀（已禁用四视图，直接生成单张场景图）
export const LOCATION_PROMPT_SUFFIX = ''

// 角色资产图生成比例（当前角色设定图实际使用 3:2）
export const CHARACTER_ASSET_IMAGE_RATIO = '3:2'
// 历史保留：旧注释中曾写 16:9，但当前资产图生成统一以 CHARACTER_ASSET_IMAGE_RATIO 为准
export const CHARACTER_IMAGE_RATIO = CHARACTER_ASSET_IMAGE_RATIO
// 角色图片尺寸（用于Seedream API）
export const CHARACTER_IMAGE_SIZE = '3840x2160'  // 16:9 横版
// 角色图片尺寸（用于Banana API）
export const CHARACTER_IMAGE_BANANA_RATIO = CHARACTER_ASSET_IMAGE_RATIO

// 道具图片生成比例（与角色资产图保持一致）
export const PROP_IMAGE_RATIO = CHARACTER_ASSET_IMAGE_RATIO

// 场景图片生成比例（1:1 正方形单张场景）
export const LOCATION_IMAGE_RATIO = '1:1'
// 场景图片尺寸（用于Seedream API）- 4K
export const LOCATION_IMAGE_SIZE = '4096x4096'  // 1:1 正方形 4K
// 场景图片尺寸（用于Banana API）
export const LOCATION_IMAGE_BANANA_RATIO = '1:1'

// 从提示词中移除角色系统后缀（用于显示给用户）
export function removeCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(CHARACTER_PROMPT_SUFFIX, '').trim()
}

// 添加角色系统后缀到提示词（用于生成图片）
export function addCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return CHARACTER_PROMPT_SUFFIX
  const cleanPrompt = removeCharacterPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${CHARACTER_PROMPT_SUFFIX}`
}

export function removePropPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(PROP_PROMPT_SUFFIX, '').replace(/，$/, '').trim()
}

export function addPropPromptSuffix(prompt: string): string {
  if (!prompt) return PROP_PROMPT_SUFFIX
  const cleanPrompt = removePropPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${PROP_PROMPT_SUFFIX}`
}

// 从提示词中移除场景系统后缀（用于显示给用户）
export function removeLocationPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(LOCATION_PROMPT_SUFFIX, '').replace(/，$/, '').trim()
}

// 添加场景系统后缀到提示词（用于生成图片）
export function addLocationPromptSuffix(prompt: string): string {
  // 后缀为空时直接返回原提示词
  if (!LOCATION_PROMPT_SUFFIX) return prompt || ''
  if (!prompt) return LOCATION_PROMPT_SUFFIX
  const cleanPrompt = removeLocationPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${LOCATION_PROMPT_SUFFIX}`
}

/**
 * 构建角色介绍字符串（用于发送给 AI，帮助理解"我"和称呼对应的角色）
 * @param characters - 角色列表，需要包含 name 和 introduction 字段
 * @returns 格式化的角色介绍字符串
 */
export function buildCharactersIntroduction(characters: Array<{ name: string; introduction?: string | null }>): string {
  if (!characters || characters.length === 0) return '暂无角色介绍'

  const introductions = characters
    .filter(c => c.introduction && c.introduction.trim())
    .map(c => `- ${c.name}：${c.introduction}`)

  if (introductions.length === 0) return '暂无角色介绍'

  return introductions.join('\n')
}
