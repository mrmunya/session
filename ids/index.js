const fs = require('fs');

function BMX_BOTId(num = 4) {
    let result = "";
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    const characters9 = characters.length;

    for (let i = 0; i < num; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * characters9)
        );
    }

    return result;
}

function generateRandomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';

    for (let i = 0; i < 8; i++) {
        result += chars.charAt(
            Math.floor(Math.random() * chars.length)
        );
    }

    return result;
}

async function removeFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return false;
    }

    await fs.promises.rm(filePath, {
        recursive: true,
        force: true
    });

    return true;
}

module.exports = {
    BMX_BOTId,
    removeFile,
    generateRandomCode
};
