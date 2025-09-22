# Test the Enyalis Chat API locally

# Test basic server
Write-Host "Testing basic server connection..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000" -Method Get
    Write-Host "Server is running: $response" -ForegroundColor Green
} catch {
    Write-Host "Server connection failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test user registration
Write-Host "`nTesting user registration..." -ForegroundColor Green
$registerBody = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/users/register" -Method Post -Body $registerBody -ContentType "application/json"
    Write-Host "User registered: $($response.message)" -ForegroundColor Green
} catch {
    Write-Host "Registration failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test user login
Write-Host "`nTesting user login..." -ForegroundColor Green
$loginBody = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/users/login" -Method Post -Body $loginBody -ContentType "application/json"
    Write-Host "User logged in successfully" -ForegroundColor Green
    $token = $loginResponse.token
    Write-Host "Token received (first 20 chars): $($token.Substring(0, [Math]::Min(20, $token.Length)))..." -ForegroundColor Yellow
} catch {
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test channel creation
Write-Host "`nTesting channel creation..." -ForegroundColor Green
$channelBody = @{
    name = "general"
} | ConvertTo-Json

try {
    $channelResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/channels" -Method Post -Body $channelBody -ContentType "application/json"
    Write-Host "Channel created: $($channelResponse.name) (ID: $($channelResponse.id))" -ForegroundColor Green
} catch {
    Write-Host "Channel creation failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test getting channels
Write-Host "`nTesting get channels..." -ForegroundColor Green
try {
    $channels = Invoke-RestMethod -Uri "http://localhost:3000/api/channels" -Method Get
    Write-Host "Retrieved $($channels.Count) channels" -ForegroundColor Green
    foreach ($channel in $channels) {
        Write-Host "  - $($channel.name) (ID: $($channel.id))" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Getting channels failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test sending message
Write-Host "`nTesting send message..." -ForegroundColor Green
$messageBody = @{
    channelId = 1
    userId = 1
    text = "Hello, this is a test message!"
} | ConvertTo-Json

try {
    $messageResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/messages" -Method Post -Body $messageBody -ContentType "application/json"
    Write-Host "Message sent: $($messageResponse.text)" -ForegroundColor Green
    Write-Host "  Message ID: $($messageResponse.id), Timestamp: $($messageResponse.timestamp)" -ForegroundColor Yellow
} catch {
    Write-Host "Sending message failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test getting messages
Write-Host "`nTesting get messages..." -ForegroundColor Green
try {
    $messages = Invoke-RestMethod -Uri "http://localhost:3000/api/messages/1" -Method Get
    Write-Host "Retrieved $($messages.Count) messages from channel 1" -ForegroundColor Green
    foreach ($message in $messages) {
        Write-Host "  - User $($message.userId): $($message.text)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Getting messages failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nAPI testing complete!" -ForegroundColor Green
Write-Host "The server is running at http://localhost:3000" -ForegroundColor Cyan
Write-Host "You can now make changes to the code and nodemon will auto-reload the server." -ForegroundColor Cyan