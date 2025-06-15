# GIF to ASCII Animation System

This folder contains GIF files that will be automatically converted to ASCII animations for blog posts.

## How to use:

1. **Add a GIF**: Place your GIF file in this folder with the exact same name as your blog post slug.
   - Example: For a post with slug `mi-primer-post`, name your GIF `mi-primer-post.gif`

2. **GIF Requirements**:
   - Keep GIFs small (< 1MB recommended)
   - Simpler animations work better for ASCII conversion
   - High contrast images produce better ASCII art
   - Recommended dimensions: 100-200px width

3. **Automatic Conversion**: 
   - The system will automatically detect the GIF when the post is loaded
   - It will convert each frame to ASCII art
   - The ASCII frames will be cached for performance

## Example:

For the post "¿por qué corres?", you would add:
```
content/gifs/¿por qué corres?.gif
```

The system will then:
1. Detect the GIF when the post is accessed
2. Convert all frames to ASCII art
3. Display the animation on the left side of the post (desktop only)

## Tips for best results:

- Use GIFs with clear, simple shapes
- Black and white or high contrast GIFs work best
- Keep frame count reasonable (10-30 frames)
- Test different brightness/contrast settings in your GIF

## Fallback:

If no GIF is found for a post, the system will use the hardcoded ASCII animations defined in the API.