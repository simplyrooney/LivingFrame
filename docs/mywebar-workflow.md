# MyWebAR fulfillment workflow

1. Customer uploads the original photo and video.
2. A unique frame code identifies the order.
3. Admin opens the customer's original files.
4. Create a MyWebAR flat-image project manually.
5. Use the exact customer photo as the image target.
6. Place/scale the video manually until it looks correct.
7. Publish the MyWebAR project.
8. Save the published HTTPS URL in `frames.ar_experience_url`.
9. Print the exact target image used in MyWebAR.
10. Customer opens `/ar-viewer.html?frame=LF-XXXXXXXX`.
11. The Worker resolves the frame code and opens the mapped MyWebAR experience.
