//export const KREEP_URL = "https://kreep.origamiz.top"

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    })
}

export class Overlay {
    private root: HTMLDivElement
    private captionElement: HTMLDivElement
    private aboutElement: HTMLDivElement
    private contentElement: HTMLDivElement

    constructor() {
        this.root = document.createElement('div');
        this.captionElement = document.createElement('div');
        this.aboutElement = document.createElement('div');
        this.contentElement = document.createElement('div');
        Overlay.configureRoot(this.root);
        Overlay.configureCaption(this.captionElement);
        Overlay.configureAbout(this.aboutElement);
        Overlay.configureContent(this.contentElement);
        this.root.appendChild(this.captionElement);
        this.root.appendChild(this.aboutElement);
        this.root.appendChild(this.contentElement);
        this.hide();
        document.body.appendChild(this.root);
    }

    private static configureRoot(root: HTMLDivElement) {
        root.style.position = 'fixed';
        root.style.top = root.style.left = '0';
        root.style.width = '100vw';
        root.style.height = '100vh';
        root.style.backdropFilter = 'blur(5px)';
        root.style.backgroundColor = 'rgba(0, 0, 0, .3)';
        root.style.color = 'white';
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
        root.style.gap = '10px';
        root.style.justifyContent = 'center';
        root.style.textAlign = 'center';
        root.style.zIndex = '1000';
    }

    private static configureCaption(caption: HTMLDivElement) {
        caption.style.fontFamily = "Microsoft YaHei UI, sans-serif";
        caption.style.fontSize = '40px';
        caption.style.fontWeight = 'bold';
    }
    
    private static configureAbout(about: HTMLDivElement) {
        about.style.fontFamily = "Microsoft YaHei UI, sans-serif";
        about.style.textTransform = 'uppercase';
        about.style.fontSize = '14px';
        about.style.letterSpacing = '2px';
        about.style.marginBottom = '20px';
    }
    
    private static configureContent(content: HTMLDivElement) {
        content.style.fontFamily = "Consolas, monospace";
        content.style.fontSize = '20px';
    }

    show() {
        this.root.style.visibility = 'visible';
        this.root.style.pointerEvents = 'auto';
    }

    hide() {
        this.root.style.visibility = 'hidden';
        this.root.style.pointerEvents = 'none';
    }

    unmount() {
        document.body.removeChild(this.root);
    }

    setCaption(text: string) {
        this.captionElement.textContent = text;
    }

    setAbout(text: string) {
        this.aboutElement.textContent = text;
    }

    setContent(text: string) {
        this.contentElement.textContent = text;
    }
}

export default class Kreep {
    private id: string
    private key: Uint8Array
    private url: string
    private _userInput: HTMLInputElement | null
    private _passwordInput: HTMLInputElement | null
    private _submitButton: HTMLElement | null

    constructor(id: string, key: string, url: string) {
        this.id = id;
        this.key = fromHex(key);
        this.url = url;
        this._userInput = this._passwordInput = null;
    }

    userInput(el: HTMLInputElement): this {
        this._userInput = el;
        return this;
    }

    passwordInput(el: HTMLInputElement): this {
        this._passwordInput = el;
        return this;
    }

    submitButton(el: HTMLElement): this {
        this._submitButton = el;
        return this;
    }

    async autoFill() {
        const overlay = new Overlay();
        overlay.setCaption("Kreep");
        overlay.setAbout("by Github/origamizyt");
        overlay.setContent(`Downloading credential from ${this.url}...`);
        overlay.show();
        const response = await fetch(this.url + "/" + this.id, {
            method: 'POST',
        });
        overlay.setContent("Decrypting credential...");
        const ciphertextHex = await response.text();
        let ciphertext = fromHex(ciphertextHex);
        let nonce = ciphertext.subarray(0, 12);
        ciphertext = ciphertext.subarray(12);
        const cipher = new Aes256GcmSiv(this.key, nonce);
        const plaintext = cipher.decrypt(ciphertext, fromHex(this.id));
        if (plaintext !== null) {
            overlay.setContent("Auto-filling forms...");
            const payload = JSON.parse(new TextDecoder().decode(plaintext));
            console.log(payload);
            if (this._userInput !== null)
                this._userInput.value = payload[0];
            if (this._passwordInput !== null)
                this._passwordInput.value = payload[1];
            if (this._submitButton)
                this._submitButton.click()
            else {
                let element: HTMLElement | null = this._passwordInput;
                while (element && (element = element.parentElement)) {
                    if (element.tagName == 'form') {
                        (element as HTMLFormElement).requestSubmit();
                    }
                }
            }
        }
        else {
            overlay.unmount();
        }
    }
}

function toHex(data: Uint8Array): string {
    let hex = '';
    for (const code of data) {
        hex += code.toString(16).padStart(2, '0');
    }
    return hex;
}

function fromHex(hex: string): Uint8Array {
    // uuid
    hex = hex.replaceAll('-', '');
    let data = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        data[i/2] = parseInt(hex.slice(i, i+2), 16);
    }
    return data;
}

function fromLittleEndian(data: Uint8Array): bigint {
    let result = 0n, power = 1n;
    for (const code of data) {
        result += power * BigInt(code);
        power <<= 8n;
    }
    return result;
}

function toLittleEndian(value: bigint, maxBytes: number, fixed: boolean = false): Uint8Array {
    let result = new Uint8Array(maxBytes);
    let index = 0;
    while (value) {
        const char = Number(value % 256n);
        result[index++] = char;
        value >>= 8n;
    }
    return fixed ? result : result.slice(0, index);
}

function concatBytes(...bytes: Uint8Array[]): Uint8Array {
    const length = bytes.map(b => b.length).reduce((a, b) => a + b);
    const output = new Uint8Array(length);
    let index = 0;
    for (const b of bytes) {
        output.set(b, index);
        index += b.length;
    }
    return output;
}

function byte(value: number): Byte {
    return new Byte(value);
}

class Byte {
    private u8: number

    constructor(value: number) {
        this.u8 = value
    }

    get high(): number {
        return (this.u8 & 0xf0) >> 4;
    }

    get low(): number {
        return this.u8 & 0x0f;
    }

    get code(): number {
        return this.u8;
    }

    bit(which: number): boolean {
        return Boolean(this.u8 & (1 << which));
    }

    add(other: Byte | number): Byte {
        if (other instanceof Byte) {
            other = other.u8;
        }
        return byte(this.u8 ^ other);
    }

    private xtimes(): Byte {
        if (this.u8 & 0b10000000)
            return byte((this.u8 & 0b01111111) << 1).add(0b00011011);
        else
            return byte((this.u8 & 0b01111111) << 1);
    }

    multiply(other: Byte): Byte {
        let power: Byte = this;
        let result = byte(0);
        for (let i = 0; i < 8; ++i) {
            if (other.bit(i))
                result = result.add(power);
            power = power.xtimes();
        }
        return result;
    }

    power(x: number): Byte {
        let result: Byte = this;
        for (let i = 0; i < x - 1; ++i) {
            result = result.multiply(this);
        }
        return result;
    }

    inverse(): Byte {
        return this.power(254);
    }
}

class Vector {
    private data: Byte[]

    constructor(data: Byte[]) {
        this.data = data
    }

    static zeroed(size: number): Vector {
        return new Vector(Array(size).fill(byte(0)));
    }

    get length(): number {
        return this.data.length;
    }

    get(index: number): Byte {
        return this.data[index]
    }

    add(other: Vector): Vector {
        return new Vector(this.data.map((b, index) => b.add(other.get(index))))
    }

    shift(x: number): Vector {
        return new Vector([...this.data.slice(x), ...this.data.slice(0, x)]);
    }
    
    dot(other: Vector): Byte {
        return this.data
            .map((b, index) => b.multiply(other.get(index)))
            .reduce((a, b) => a.add(b))
    }

    copy(): Vector {
        return new Vector([...this.data])
    }

    map(f: (b: Byte, index: number) => Byte): Vector {
        return new Vector(this.data.map(f));
    }

    toBytes(): Uint8Array {
        return Uint8Array.from(this.data.map(b => b.code));
    }
}

class Matrix {
    private rows: Vector[]

    constructor(rows: Vector[]) {
        this.rows = rows;
    }

    static fromBytes(rows: Uint8Array[]): Matrix {
        return new Matrix(
            rows.map(row => 
                new Vector(Array.from(row).map(byte))
            )
        );
    }

    static splitBytes(data: Uint8Array, columns: number): Matrix {
        return Matrix.fromBytes(
            Array(data.length / columns)
                .fill(null)
                .map((_, index) => data.slice(index*4, index*4+4))
        );
    }

    static zeroed(rows: number, columns: number): Matrix {
        return new Matrix(
            Array(rows)
                .fill(null)
                .map(() => Vector.zeroed(columns))
        )
    }

    get length(): number {
        return this.rows.length;
    }

    get(index: number): Vector {
        return this.rows[index]
    }

    append(row: Vector) {
        this.rows.push(row);
    }

    vectorMultiply(vector: Vector): Vector {
        return new Vector(this.rows.map(row => vector.dot(row)));
    }

    map(f: (row: Vector, index: number) => Vector): Matrix {
        return new Matrix(this.rows.map(f));
    }

    toBytes(): Uint8Array {
        return concatBytes(...this.rows.map(row => row.toBytes()));
    }
}


export class Aes256 {
    private static readonly SBOX = [
        [0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76],
        [0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0],
        [0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15],
        [0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75],
        [0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84],
        [0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf],
        [0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8],
        [0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2],
        [0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73],
        [0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb],
        [0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79],
        [0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08],
        [0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a],
        [0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e],
        [0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf],
        [0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16]
    ]
    
    private static readonly INV_SBOX = [
        [0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb],
        [0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb],
        [0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e],
        [0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25],
        [0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92],
        [0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84],
        [0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06],
        [0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b],
        [0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73],
        [0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e],
        [0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b],
        [0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4],
        [0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f],
        [0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef],
        [0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61],
        [0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d]
    ]
    
    private static readonly MIX_COLUMNS_MATRIX = Matrix.fromBytes([
        Uint8Array.from([0x02, 0x03, 0x01, 0x01]),
        Uint8Array.from([0x01, 0x02, 0x03, 0x01]),
        Uint8Array.from([0x01, 0x01, 0x02, 0x03]),
        Uint8Array.from([0x03, 0x01, 0x01, 0x02]),
    ])
    
    private static readonly INV_MIX_COLUMNS_MATRIX = Matrix.fromBytes([
        Uint8Array.from([0x0e, 0x0b, 0x0d, 0x09]),
        Uint8Array.from([0x09, 0x0e, 0x0b, 0x0d]),
        Uint8Array.from([0x0d, 0x09, 0x0e, 0x0b]),
        Uint8Array.from([0x0b, 0x0d, 0x09, 0x0e]),
    ])
    
    private static readonly RCON = Matrix.fromBytes([
        Uint8Array.from([0x00, 0x00, 0x00, 0x00]), // placeholder
        Uint8Array.from([0x01, 0x00, 0x00, 0x00]), // j = 1
        Uint8Array.from([0x02, 0x00, 0x00, 0x00]),
        Uint8Array.from([0x04, 0x00, 0x00, 0x00]),
        Uint8Array.from([0x08, 0x00, 0x00, 0x00]),
        Uint8Array.from([0x10, 0x00, 0x00, 0x00]),
        Uint8Array.from([0x20, 0x00, 0x00, 0x00]),
        Uint8Array.from([0x40, 0x00, 0x00, 0x00]),
        Uint8Array.from([0x80, 0x00, 0x00, 0x00]),
        Uint8Array.from([0x1b, 0x00, 0x00, 0x00]),
        Uint8Array.from([0x36, 0x00, 0x00, 0x00]),
    ])

    private static sbox(b: Byte): Byte {
        return byte(Aes256.SBOX[b.high][b.low]);
    }

    private static invSbox(b: Byte): Byte {
        return byte(Aes256.INV_SBOX[b.high][b.low]);
    }

    private static subBytes(s: Matrix): Matrix {
        return s.map(row => row.map(Aes256.sbox));
    }

    private static invSubBytes(s: Matrix): Matrix {
        return s.map(row => row.map(Aes256.invSbox));
    }

    private static shiftRows(s: Matrix): Matrix {
        const matrix = [
            [byte(0),byte(0),byte(0),byte(0)],
            [byte(0),byte(0),byte(0),byte(0)],
            [byte(0),byte(0),byte(0),byte(0)],
            [byte(0),byte(0),byte(0),byte(0)],
        ];
        for (let i = 0; i < 4; ++i)
            for (let j = 0; j < 4; ++j)
                matrix[i][j] = s.get((i+j) % 4).get(j);
        return new Matrix(matrix.map(row => new Vector(row)));
    }

    private static invShiftRows(s: Matrix): Matrix {
        const matrix = [
            [byte(0),byte(0),byte(0),byte(0)],
            [byte(0),byte(0),byte(0),byte(0)],
            [byte(0),byte(0),byte(0),byte(0)],
            [byte(0),byte(0),byte(0),byte(0)],
        ];
        for (let i = 0; i < 4; ++i)
            for (let j = 0; j < 4; ++j)
                matrix[i][j] = s.get((i-j+4) % 4).get(j);
        return new Matrix(matrix.map(row => new Vector(row)));
    }

    private static mixColumns(s: Matrix): Matrix {
        return s.map(row => Aes256.MIX_COLUMNS_MATRIX.vectorMultiply(row));
    }

    private static invMixColumns(s: Matrix): Matrix {
        return s.map(row => Aes256.INV_MIX_COLUMNS_MATRIX.vectorMultiply(row));
    }

    private static addRoundKey(s: Matrix, key: Matrix, nRound: number): Matrix {
        return s.map((row, index) => row.add(key.get(4 * nRound + index)));
    }

    private static subWord(word: Vector): Vector {
        return word.map(Aes256.sbox);
    }

    private static keyExpansion(key: Uint8Array, nRound: number): Matrix {
        const w = Matrix.splitBytes(key, 4);
        const nKey = key.length / 4;
        for (let i = nKey; i < 4 * (nRound + 1); ++i) {
            let temp = w.get(i-1);
            if (i % nKey === 0)
                temp = Aes256.subWord(temp.shift(1)).add(Aes256.RCON.get(i / nKey));
            else if (nKey > 6 && i % nKey === 4)
                temp = Aes256.subWord(temp)
            w.append(w.get(i - nKey).add(temp));
        }
        return w;
    }

    private static readonly N_ROUND = 14;

    private key: Matrix

    constructor(key: Uint8Array) {
        this.key = Aes256.keyExpansion(key, Aes256.N_ROUND);
    }

    encrypt(message: Uint8Array): Uint8Array {
        let state = Matrix.splitBytes(message, 4);
        state = Aes256.addRoundKey(state, this.key, 0);
        for (let i = 1; i < Aes256.N_ROUND; ++i) {
            state = Aes256.subBytes(state);
            state = Aes256.shiftRows(state);
            state = Aes256.mixColumns(state);
            state = Aes256.addRoundKey(state, this.key, i);
        }
        state = Aes256.subBytes(state);
        state = Aes256.shiftRows(state);
        state = Aes256.addRoundKey(state, this.key, Aes256.N_ROUND);
        return state.toBytes();
    }

    decrypt(message: Uint8Array): Uint8Array {
        let state = Matrix.splitBytes(message, 4);
        state = Aes256.addRoundKey(state, this.key, Aes256.N_ROUND);
        for (let i = Aes256.N_ROUND - 1; i > 0; --i) {
            state = Aes256.invShiftRows(state);
            state = Aes256.invSubBytes(state);
            state = Aes256.addRoundKey(state, this.key, i);
            state = Aes256.invMixColumns(state);
        }
        state = Aes256.invShiftRows(state);
        state = Aes256.invSubBytes(state);
        state = Aes256.addRoundKey(state, this.key, 0);
        return state.toBytes();
    }
}

export class Aes256Ctr {
    private key: Uint8Array

    constructor(key: Uint8Array) {
        this.key = key;
    }

    cipher(initialCounterBlock: Uint8Array, message: Uint8Array): Uint8Array {
        const block = Uint8Array.from(initialCounterBlock);
        const output = new Uint8Array(message.length);
        let index = 0;
        while (message.length > 0) {
            const keyStream = new Aes256(this.key).encrypt(block);
            block.set(
                toLittleEndian(
                    fromLittleEndian(block.subarray(0, 4)) + 1n,
                    4, true
                )
            );
            const todo = Math.min(message.length, keyStream.length);
            for (let i = 0; i < todo; ++i, ++index) {
                output[index] = keyStream[i] ^ message[i];
            }
            message = message.subarray(todo);
        }
        return output;
    }
}

class Element {
    private u128: bigint

    constructor(value: bigint) {
        this.u128 = value;
    }

    static fromBytes(data: Uint8Array): Element {
        return new Element(fromLittleEndian(data));
    }

    get code(): bigint {
        return this.u128;
    }

    bit(which: number): boolean {
        return Boolean(this.u128 & (1n << BigInt(which)));
    }

    add(other: Element | bigint): Element {
        if (other instanceof Element) {
            other = other.u128;
        }
        return new Element(this.u128 ^ other);
    }

    private xtimes(): Element {
        if (this.u128 & (1n << 127n))
            return new Element((this.u128 & ((1n << 127n) - 1n)) << 1n).add((1n << 127n) + (1n << 126n) + (1n << 121n) + 1n);
        else
            return new Element((this.u128 & ((1n << 127n) - 1n)) << 1n);
    }

    multiply(other: Element): Element {
        let power: Element = this;
        let result = new Element(0n);
        for (let i = 0; i < 128; ++i) {
            if (other.bit(i))
                result = result.add(power);
            power = power.xtimes();
        }
        return result;
    }

    dot(other: Element): Element {
        return this.multiply(other).multiply(
            new Element((1n << 127n) + (1n << 124n) + (1n << 121n) + (1n << 114n) + 1n)
        );
    }

    toBytes(): Uint8Array {
        return toLittleEndian(this.u128, 16, true);
    }
}

export class Polyval {
    private key: Element

    constructor(key: Uint8Array) {
        this.key = Element.fromBytes(key);
    }

    digest(message: Uint8Array): Uint8Array {
        let s = new Element(0n);
        for (let i = 0; i < message.length; i += 16) {
            const chunk = message.subarray(i, i+16);
            s = (Element.fromBytes(chunk).add(s)).dot(this.key);
        }
        return s.toBytes();
    }
}

export class Aes256GcmSiv {
    private static rightPad(message: Uint8Array): Uint8Array {
        const length = Math.ceil(message.length / 16) * 16;
        const output = new Uint8Array(length);
        output.set(message);
        return output;
    }

    private static deriveKeys(key: Uint8Array, nonce: Uint8Array): [Uint8Array, Uint8Array] {
        const cipher = new Aes256(key);
        const authKey = new Uint8Array(16), encryptKey = new Uint8Array(32);
        authKey.set(
            cipher.encrypt(
                concatBytes(
                    toLittleEndian(0n, 4, true),
                    nonce
                )
            ).subarray(0, 8)
        )
        authKey.set(
            cipher.encrypt(
                concatBytes(
                    toLittleEndian(1n, 4, true),
                    nonce
                )
            ).subarray(0, 8),
            8
        )
        encryptKey.set(
            cipher.encrypt(
                concatBytes(
                    toLittleEndian(2n, 4, true),
                    nonce
                )
            ).slice(0, 8)
        )
        encryptKey.set(
            cipher.encrypt(
                concatBytes(
                    toLittleEndian(3n, 4, true),
                    nonce
                )
            ).slice(0, 8),
            8
        )
        encryptKey.set(
            cipher.encrypt(
                concatBytes(
                    toLittleEndian(4n, 4, true),
                    nonce
                )
            ).slice(0, 8),
            16
        )
        encryptKey.set(
            cipher.encrypt(
                concatBytes(
                    toLittleEndian(5n, 4, true),
                    nonce
                )
            ).slice(0, 8),
            24
        )
        return [authKey, encryptKey];
    }

    private key: Uint8Array
    private nonce: Uint8Array

    constructor(key: Uint8Array, nonce: Uint8Array) {
        this.key = key;
        this.nonce = nonce;
    }

    encrypt(plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
        const [authKey, encryptKey] = Aes256GcmSiv.deriveKeys(this.key, this.nonce);
        const lengthBlock = concatBytes(
            toLittleEndian(BigInt(aad.length) * 8n, 8, true),
            toLittleEndian(BigInt(plaintext.length) * 8n, 8, true),
        );
        const paddedPlaintext = Aes256GcmSiv.rightPad(plaintext);
        const paddedAad = Aes256GcmSiv.rightPad(aad);
        const ss = new Polyval(authKey).digest(
            concatBytes(
                paddedAad,
                paddedPlaintext,
                lengthBlock
            )
        );
        for (let i = 0; i < this.nonce.length; ++i) {
            ss[i] ^= this.nonce[i];
        }
        ss[15] &= 0x7f;
        const tag = new Aes256(encryptKey).encrypt(ss);
        const counterBlock = Uint8Array.from(tag);
        counterBlock[15] |= 0x80;
        return concatBytes(
            new Aes256Ctr(encryptKey).cipher(counterBlock, plaintext),
            tag
        );
    }

    decrypt(ciphertext: Uint8Array, aad: Uint8Array): Uint8Array | null {
        const [authKey, encryptKey] = Aes256GcmSiv.deriveKeys(this.key, this.nonce);
        const tag = ciphertext.subarray(-16);
        ciphertext = ciphertext.subarray(0, -16);
        const counterBlock = Uint8Array.from(tag);
        counterBlock[15] |= 0x80;
        const plaintext = new Aes256Ctr(encryptKey).cipher(counterBlock, ciphertext);
        const lengthBlock = concatBytes(
            toLittleEndian(BigInt(aad.length) * 8n, 8, true),
            toLittleEndian(BigInt(plaintext.length) * 8n, 8, true),
        );
        const paddedPlaintext = Aes256GcmSiv.rightPad(plaintext);
        const paddedAad = Aes256GcmSiv.rightPad(aad);
        const ss = new Polyval(authKey).digest(
            concatBytes(
                paddedAad,
                paddedPlaintext,
                lengthBlock
            )
        );
        for (let i = 0; i < this.nonce.length; ++i) {
            ss[i] ^= this.nonce[i];
        }
        ss[15] &= 0x7f;
        const expectedTag = new Aes256(encryptKey).encrypt(ss);
        let xorSum = 0;
        for (let i = 0; i < 16; ++i) {
            xorSum |= tag[i] ^ expectedTag[i];
        }
        if (xorSum) {
            return null;
        }
        return plaintext;
    }
}

// IIFE
((window: any) => {
    window.Kreep = Kreep;
})(globalThis);