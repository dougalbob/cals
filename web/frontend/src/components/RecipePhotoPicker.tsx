import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { recipeImageFileError } from '../lib/recipeImage'

interface RecipePhotoPickerProps {
  variant: 'form' | 'hero'
  recipeName: string
  currentImageUrl: string | null
  selectedFile: File | null
  onFileChange: (file: File | null) => void
  onUpload?: () => void
  onUploadErrorClear?: () => void
  isUploading?: boolean
  uploadError?: string | null
  children?: ReactNode
}

/** A direct photo picker with a local preview. It deliberately does not crop. */
export function RecipePhotoPicker({
  variant,
  recipeName,
  currentImageUrl,
  selectedFile,
  onFileChange,
  onUpload,
  onUploadErrorClear,
  isUploading = false,
  uploadError = null,
  children,
}: RecipePhotoPickerProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null)
  const previewUrl = selectedFile && preview?.file === selectedFile ? preview.url : null

  useEffect(() => {
    if (!selectedFile && inputRef.current) inputRef.current.value = ''
  }, [selectedFile])

  useEffect(() => {
    if (!preview || preview.file !== selectedFile) return
    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(preview.url)
    }
  }, [preview, selectedFile])

  const replacePreview = (file: File | null) => {
    setPreview(file && typeof URL.createObjectURL === 'function'
      ? { file, url: URL.createObjectURL(file) }
      : null)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    const error = recipeImageFileError(file)
    if (error) {
      replacePreview(null)
      setSelectionError(error)
      onFileChange(null)
      onUploadErrorClear?.()
      return
    }

    replacePreview(file)
    setSelectionError(null)
    onUploadErrorClear?.()
    onFileChange(file)
  }

  const clearSelection = () => {
    replacePreview(null)
    setSelectionError(null)
    onUploadErrorClear?.()
    onFileChange(null)
  }

  const imageSrc = selectedFile ? previewUrl : currentImageUrl
  const imageLabel = selectedFile ? 'Selected photo preview' : recipeName
  const chooseLabel = variant === 'hero'
    ? (currentImageUrl ? 'Replace photo' : 'Add photo')
    : (selectedFile ? 'Choose another photo' : 'Choose photo')

  const imageFrame = (
    <div className={variant === 'hero'
      ? 'relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-emerald-700 via-green-600 to-green-900'
      : 'relative aspect-[16/9] overflow-hidden rounded-xl border border-line bg-gradient-to-br from-emerald-700 via-green-600 to-green-900'}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={imageLabel}
          className={`h-full w-full ${selectedFile ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-white">
          <span aria-hidden="true" className="text-5xl drop-shadow">📷</span>
          <span className="text-xs font-medium tracking-wide text-white/90">
            {selectedFile ? selectedFile.name : variant === 'hero' ? 'NO PHOTO YET' : 'No photo selected'}
          </span>
        </div>
      )}

      {variant === 'hero' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28 bg-gradient-to-t from-black/65 to-transparent" />
          {children}
        </>
      )}

      {variant === 'hero' ? (
        <label
          htmlFor={inputId}
          className="absolute right-3 top-3 z-20 flex min-h-11 cursor-pointer items-center rounded-xl bg-black/65 px-3 text-sm font-semibold text-white shadow-md backdrop-blur-sm hover:bg-black/75"
        >
          {isUploading ? 'Uploading…' : chooseLabel}
          <input
            ref={inputRef}
            id={inputId}
            aria-label="Choose recipe photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isUploading}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>
      ) : (
        <input
          ref={inputRef}
          id={inputId}
          aria-label="Choose recipe photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="sr-only"
        />
      )}
    </div>
  )

  const errorMessage = selectionError
    ? selectionError
    : uploadError
      ? `Photo upload failed: ${uploadError}`
      : null

  if (variant === 'hero') {
    return (
      <div>
        {imageFrame}
        {selectedFile && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-light bg-card px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-ink-light">
              {previewUrl ? `Previewing ${selectedFile.name}` : `Selected ${selectedFile.name}`}
            </span>
            <div className="flex shrink-0 gap-2">
              {onUpload && (
                <button
                  type="button"
                  onClick={onUpload}
                  disabled={isUploading}
                  className="min-h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isUploading ? 'Uploading…' : 'Upload photo'}
                </button>
              )}
              <button
                type="button"
                onClick={clearSelection}
                disabled={isUploading}
                className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {errorMessage && (
          <p role="alert" className="m-0 border-b border-line-light bg-danger/10 px-3 py-2 text-sm text-danger">
            {errorMessage}
          </p>
        )}
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line-light bg-surface p-3" aria-label="Recipe photo">
      <div>
        <h3 className="m-0 text-sm font-semibold">Photo (optional)</h3>
        <p className="mb-0 mt-1 text-xs text-ink-light">
          Choose or take a JPEG, PNG or WebP photo, up to 10 MB. It uploads after the recipe is created; cropping is not included.
        </p>
      </div>
      {imageFrame}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-light">
          {selectedFile ? (previewUrl ? `Previewing ${selectedFile.name}` : `Selected ${selectedFile.name}`) : 'No photo selected'}
        </span>
        <div className="flex shrink-0 gap-2">
          <label
            htmlFor={inputId}
            className="flex min-h-11 cursor-pointer items-center rounded-xl border border-primary px-4 text-sm font-semibold text-primary-dark hover:bg-primary/5"
          >
            {chooseLabel}
          </label>
          {selectedFile && (
            <button
              type="button"
              onClick={clearSelection}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>
      {errorMessage && <p role="alert" className="m-0 text-sm text-danger">{errorMessage}</p>}
    </section>
  )
}

