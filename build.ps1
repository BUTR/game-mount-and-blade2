$ExtensionBasePath = "../Bannerlord.VortexExtension";
$ExtensionPath = "$ExtensionBasePath\src\Bannerlord.VortexExtension.Native.TypeScript";

Push-Location "$ExtensionPath";
try {
    npm run clean;
    npm run build;
    npm pack;
 }
 catch {
    exit;
 }
 finally {
    Pop-Location;
 }

npm run clean;
Copy-Item -Path "$ExtensionPath\butr-vortexextensionnative-1.0.0.tgz" -Destination $ThisPath;
npm i ./butr-vortexextensionnative-1.0.0.tgz;
npm run build;
npm run bundle7z;