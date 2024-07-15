import * as fs from 'fs';

// Function to read JSON data from a file
export const readJSONFromFile = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading JSON file:', error);
        return null;
    }
}

// Function to write JSON data to a file
export const writeJSONToFile = (filePath, jsonData) => {
    try {
        const jsonString = JSON.stringify(jsonData, null, 2);
        fs.writeFileSync(filePath, jsonString, 'utf-8');
        console.log('JSON data written to file successfully.');
    } catch (error) {
        console.error('Error writing JSON data to file:', error);
    }
}

