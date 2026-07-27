#!/bin/bash

# BsmartQ Desktop Build Script for macOS/Linux

echo ""
echo "===================================================="
echo "BsmartQ Desktop Application Builder"
echo "===================================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[1/5] Checking Node.js version..."
node --version
echo ""

echo "[2/5] Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi
echo ""

echo "[3/5] Building BsmartQ Desktop..."
echo "Note: This may take several minutes..."
echo ""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Building for macOS..."
    npm run build:mac
    BUILD_OUTPUT="BsmartQ Desktop-1.0.0.dmg"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Building for Linux..."
    npm run build:linux
    BUILD_OUTPUT="BsmartQ Desktop-1.0.0.AppImage"
else
    echo "Building for all platforms (Windows, macOS, Linux)..."
    npm run build:all
    BUILD_OUTPUT="(see dist/ folder)"
fi

if [ $? -ne 0 ]; then
    echo "ERROR: Build failed!"
    echo "Please check the error messages above."
    exit 1
fi
echo ""

echo "===================================================="
echo "SUCCESS! Desktop application built successfully!"
echo "===================================================="
echo ""
echo "Output files in: dist/"
echo ""
echo "Installation file(s): $BUILD_OUTPUT"
echo ""
echo "You can now:"
echo "1. Distribute the installer files to users"
echo "2. Or run locally: npm run desktop:dev"
echo ""
