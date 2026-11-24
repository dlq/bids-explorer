// Independent column-major fixture, including identification fields that must never escape.
export function edfFixture(reserved = ''): Buffer {
  const header = Buffer.alloc(1024, 32);
  header.write('0', 0);
  header.write('PRIVATE-PATIENT', 8);
  header.write('PRIVATE-RECORDING', 88);
  header.write('1024', 184);
  header.write(reserved, 192);
  header.write('10', 236);
  header.write('2', 244);
  header.write('3', 252);
  const columns: [number, string[]][] = [
    [16, ['Fz', 'ECG', 'EDF Annotations']],
    [80, ['', '', '']],
    [8, ['uV', 'mV', '']],
    [8, ['-100', '-1', '-1']],
    [8, ['100', '1', '1']],
    [8, ['-32768', '-32768', '-32768']],
    [8, ['32767', '32767', '32767']],
    [80, ['', '', '']],
    [8, ['400', '200', '20']],
    [32, ['', '', '']],
  ];
  let offset = 256;
  for (const [width, values] of columns) {
    values.forEach((value, index) => header.write(value, offset + index * width));
    offset += width * 3;
  }
  return header;
}
