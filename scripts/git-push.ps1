$token = (gh auth token)
$b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
git -c http.extraHeader="Authorization: Basic $b64" push origin main
