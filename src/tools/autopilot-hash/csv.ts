export interface AutopilotCsvDevice {
  serialNumber: string;
  productId: string;
  hardwareHash: string;
  groupTag: string;
  assignedUser: string;
}

export function buildAutopilotCsv(device: AutopilotCsvDevice): string {
  const values = [
    device.serialNumber.trim(), device.productId.trim(),
    device.hardwareHash.replace(/\s/g, ""), device.groupTag.trim(), device.assignedUser.trim(),
  ];
  if (!values[0]) throw new Error("Device serial number is required.");
  if (!values[2]) throw new Error("Hardware hash is required.");
  const labels = ["Device serial number", "Windows Product ID", "Hardware hash", "Group tag", "Assigned user"];
  values.forEach((value, i) => {
    if (/[",\r\n]/.test(value)) throw new Error(`${labels[i]} cannot contain commas, quotation marks or line breaks.`);
    if (/[^\x20-\x7e]/.test(value)) throw new Error(`${labels[i]} must use printable ASCII characters for an ANSI-compatible CSV.`);
  });
  if (values[4] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values[4])) {
    throw new Error("Assigned user must be a UPN, such as user@contoso.com. Verify that this user exists in your tenant.");
  }
  return `Device Serial Number,Windows Product ID,Hardware Hash,Group Tag,Assigned User\r\n${values.join(",")}\r\n`;
}
