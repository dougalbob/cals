// Simple 1:1 image cropper - returns cropped image via callback

const ImageCrop = {
    show(file, onComplete) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const image = new Image();
            image.onload = () => {
                this.processImage(image, onComplete);
            };
            image.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    processImage(image, onComplete) {
        // Create a square crop from the center of the image
        const size = Math.min(image.width, image.height);
        const offsetX = (image.width - size) / 2;
        const offsetY = (image.height - size) / 2;

        // Output size
        const outputSize = 400;
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');

        // Draw center-cropped square
        ctx.drawImage(
            image,
            offsetX, offsetY, size, size,  // Source: center square
            0, 0, outputSize, outputSize    // Dest: full canvas
        );

        // Get preview
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

        // Create file
        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], 'recipe-photo.jpg', { 
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                console.log('ImageCrop: Created', file.size, 'bytes');
                onComplete(file, dataUrl);
            }
        }, 'image/jpeg', 0.9);
    }
};
