# JPEG test fixture

`color-grid-7x5.jpg` is a project-generated baseline JPEG. Its 7 by 5 RGBA
source matrix used these values for each zero-based `(x, y)` coordinate before
encoding with the reviewed `jpeg-js` 0.4.4 encoder at quality 90:

```text
red   = (x * 37 + y * 19) & 255
green = (x * 11 + y * 53) & 255
blue  = (x * 71 + y * 7) & 255
alpha = 255
```

The committed JPEG SHA-256 is
`e191cfd1093559ba2d636b1245395561a59babf85cdbbda49708799ad6b56ab8`.

`color-grid-ycck-7x5.jpg` was derived from that fixture with ImageMagick
7.1.1-47 using `-colorspace CMYK`. It is a four-component JPEG with the
canonical Adobe APP14 transform value 2 (YCCK); ImageMagick is not needed to
run the tests. Its SHA-256 is
`f08b3604b7f68be9b6511750c3e69f1b1b911003c29ecba45492d512c5081de7`.
