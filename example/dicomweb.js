import fs from 'node:fs'
import  { parseFlow, elementFlow, elementSink, pipe, VR, ValueChunk } from 'https://esm.sh/gh/jpambrun/dicom-streams-js@b9f3be0'
import stream from 'node:stream';
// https://support.dcmtk.org/docs/dcm2json.html

function tagToString(tag) {
    const hex = ('00000000' + tag.toString(16)).slice(-8);
    return hex.toLocaleUpperCase();
}

class FilterLargeValue extends stream.Transform {
    constructor(maxSize=100) {
        super({ objectMode: true });
        this.maxSize = maxSize;
    }
    _transform(chunk, encoding, callback) {
        if (chunk instanceof ValueChunk) {
            if (chunk?.bytes?.length > this.maxSize) {
                chunk.bytes = Buffer.alloc(0);
            }
        }
        callback(null, chunk);
    }
}


class LogTransform extends stream.Transform {
    constructor() {
        super({ objectMode: true });
    }
    _transform(chunk, encoding, callback) {
        console.log(chunk);
        callback(null, chunk);
    }
}

const convertToDicomweb = (src, dst = {}) => {
    const { characterSets, data } = src;
    for (const element of data) {
        const { vr, bigEndian, value, tag, items, fragments } = element;
        const hextag = tagToString(tag);
        if (value) {
            switch (vr.name) {
                case "PN":
                    dst[hextag] = { vr: vr.name, value: [{ Alphabetic: value.toString(vr.name, bigEndian, characterSets) }] };
                    break;
                case "OB":
                case "OW":
                case "OF":
                    dst[hextag] = { vr: vr.name, value: [{ range: element.range }] };
                    break;
                default:
                    dst[hextag] = { vr: vr.name, value: value.toStrings(vr.name, bigEndian, characterSets) };
            }
        } else if (items && vr.name === "SQ") {
            dst[hextag] = {
                vr: vr.name,
                value: [],
            };

            for (const item of items) {
                const converted = convertToDicomweb(item.elements);
                dst[hextag].value.push(converted);
            }
        } else if (fragments) {
            //TODO
            console.log(element);
        } else {
            throw new Error(`Unsupported element: ${hextag} with VR ${vr.name}`);
        }
    }
    return dst;
}

await pipe(
    fs.createReadStream(process.argv[2]),
    parseFlow(),
    new FilterLargeValue(),
    elementFlow(),
    // new LogTransform(),
    elementSink(elements => {
        const dicomweb = convertToDicomweb(elements);
        // console.log(dicomweb);
    })
    // new SinkWritable()
);


