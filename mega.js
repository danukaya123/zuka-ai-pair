import { Storage } from 'megajs';

// Mega authentication credentials
const auth = {
    email: 'dinithihansika21865@gmail.com',
    password: 'danuka!12',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// Function to upload a file to Mega and return the URL
export const upload = (fileBuffer, fileName) => {
    return new Promise((resolve, reject) => {
        try {
            const storage = new Storage(auth, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                storage.upload({
                    name: fileName,
                    size: fileBuffer.length
                }, fileBuffer).exec((err, file) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    file.link((err, url) => {
                        storage.close();
                        if (err) {
                            reject(err);
                        } else {
                            resolve(url);
                        }
                    });
                });
            });
        } catch (err) {
            reject(err);
        }
    });
};

// Function to download a file from Mega using a URL
export const download = (url) => {
    return new Promise((resolve, reject) => {
        try {
            const file = mega.File.fromURL(url);
            file.loadAttributes((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                file.downloadBuffer((err, buffer) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(buffer);
                    }
                });
            });
        } catch (err) {
            reject(err);
        }
    });
};
