const net = require('net');
const fs = require('fs');

const HOST = '127.0.0.1'; 
const PORT = 3000; 
const OUTPUT_FILE = 'output.json';


const createPayload = (callType, resendSeq) => {
    const buffer = Buffer.alloc(2);
    buffer.writeInt8(callType, 0); 
    buffer.writeInt8(resendSeq, 1); 
    return buffer;
};


const parsePacket = (buffer) => {
    return {
        symbol: buffer.slice(0, 4).toString('ascii'),
        buysellindicator: buffer.slice(4, 5).toString('ascii'),
        quantity: buffer.readInt32BE(5),
        price: buffer.readInt32BE(9),
        packetSequence: buffer.readInt32BE(13)
    };
};


const getMissingSequences = (packets) => {
    const sequences = packets.map(packet => packet.packetSequence);
    const maxSequence = Math.max(...sequences);
    const missingSequences = [];
    for (let i = 1; i <= maxSequence; i++) {
        if (!sequences.includes(i)) {
            missingSequences.push(i);
        }
    }
    return missingSequences;
};


const fetchStockData = () => {
    const client = new net.Socket();
    let allPackets = [];

    client.connect(PORT, HOST, () => {
        console.log('Connected to the server.');
        client.write(createPayload(1, 0)); 
    });

    client.on('data', (data) => {
       
        for (let i = 0; i < data.length; i += 17) {
            const packet = parsePacket(data.slice(i, i + 17));
            allPackets.push(packet);
        }
    });

    client.on('close', async () => {
        console.log('Connection closed. Checking for missing sequences...');
        const missingSequences = getMissingSequences(allPackets);
        
        for (const seq of missingSequences) {
            await new Promise((resolve, reject) => {
                const resendClient = new net.Socket();
                
                resendClient.connect(PORT, HOST, () => {
                    console.log(`Requesting missing packet sequence: ${seq}`);
                    resendClient.write(createPayload(2, seq));
                });

                resendClient.on('data', (data) => {
                    const packet = parsePacket(data);
                    allPackets.push(packet);
                    resendClient.destroy();
                    resolve();
                });

                resendClient.on('error', reject);
            });
        }

      
        allPackets.sort((a, b) => a.packetSequence - b.packetSequence);

     
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPackets, null, 2));
        console.log(`Data written to ${OUTPUT_FILE}`);
    });

    client.on('error', (err) => {
        console.error(`Connection error: ${err.message}`);
    });
};

fetchStockData();
