import { v2 as cloudinary } from "cloudinary";

let configured = false;

function configureCloudinary() {
  if (configured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Missing Cloudinary environment variables");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });

  configured = true;
}

export async function uploadFlyerToCloudinary(filePath, publicId) {
  configureCloudinary();

  const result = await cloudinary.uploader.upload(filePath, {
    folder: "ocean-specials/flyers",
    public_id: publicId,
    resource_type: "image",
    overwrite: true
  });

  return {
    publicId: result.public_id,
    url: result.secure_url
  };
}

export async function deleteFlyerFromCloudinary(publicId) {
  configureCloudinary();

  return cloudinary.uploader.destroy(publicId, {
    resource_type: "image"
  });
}
